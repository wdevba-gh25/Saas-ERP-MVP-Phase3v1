from __future__ import annotations
import os
from typing import Optional, Dict, List, Any
import pyodbc
import datetime
import decimal

_CONN_STR = os.getenv("MSSQL_CONN_STR")


def _get_conn():
    if not _CONN_STR:
        raise RuntimeError("MSSQL_CONN_STR not configured")
    return pyodbc.connect(_CONN_STR, timeout=5)


def fetch_org_top_products_with_pref(
    organization_id: str,
    from_date: Optional[str] = None,  # ISO yyyy-mm-dd
    to_date: Optional[str] = None,  # ISO yyyy-mm-dd (exclusive)
    top_n: int = 10,
) -> Dict[str, Any]:
    """
    Returns top products by quantity for an organization, with preferred provider when set.
    Safe, parameterized, tenant-scoped.
    """
    with _get_conn() as conn:
        cur = conn.cursor()
        where_dates = ""
        params: List[Any] = [organization_id]
        if from_date:
            where_dates += " AND s.SaleDate >= ?"
            params.append(from_date)
        if to_date:
            where_dates += " AND s.SaleDate < ?"
            params.append(to_date)

        # Aggregate sales and join preferred providers
        sql = f"""
        WITH Vol AS (
          SELECT 
            p.OrganizationId,
            s.ProductName,
            SUM(COALESCE(s.Quantity, 0)) AS Qty,
            SUM(COALESCE(s.Amount, 0.0)) AS Amount
          FROM dbo.Sales s
          JOIN dbo.Projects p ON p.ProjectId = s.ProjectId
          WHERE p.OrganizationId = ? {where_dates}
          GROUP BY p.OrganizationId, s.ProductName
        ),
        Pref AS (
          SELECT 
            OrganizationId, 
            ProductName, 
            ProviderId
          FROM dbo.ProviderProducts
          WHERE IsPreferred = 1 
            AND OrganizationId = ?
        )
        SELECT TOP ({top_n})
          v.ProductName,
          v.Qty,
          v.Amount,
          pp.ProviderId,
          pr.Name AS ProviderName
        FROM Vol v
        LEFT JOIN Pref pp
          ON pp.OrganizationId = v.OrganizationId
         AND pp.ProductName = v.ProductName
        LEFT JOIN dbo.Providers pr
          ON pr.ProviderId = pp.ProviderId
        ORDER BY v.Qty DESC, v.Amount DESC;
        """
        # Build parameters in the correct order for the two placeholders
        # 1) OrganizationId for Vol CTE
        # 2) Optional date filters (in the same order they appear in SQL)
        # 3) OrganizationId for Pref CTE
        params: List[Any] = [organization_id]
        if from_date:
            params.append(from_date)
        if to_date:
            params.append(to_date)
        params.append(organization_id)

        rows = cur.execute(sql, params).fetchall()

        items: List[Dict[str, Any]] = []
        for r in rows:
            items.append(
                {
                    "productName": r.ProductName,
                    "qty": int(r.Qty or 0),
                    "amount": float(r.Amount or 0.0),
                    "preferredProviderId": (
                        str(r.ProviderId) if getattr(r, "ProviderId", None) else None
                    ),
                    "preferredProviderName": (
                        r.ProviderName if getattr(r, "ProviderName", None) else None
                    ),
                }
            )

    # --- NEW: Fetch monthly aggregates too (used for chart visualization) ---
    where_monthly = ""
    monthly_params: List[Any] = [organization_id]
    if from_date:
        where_monthly += " AND s.SaleDate >= ?"
        monthly_params.append(from_date)
    if to_date:
        where_monthly += " AND s.SaleDate < ?"
        monthly_params.append(to_date)

    sql_monthly = f"""
    SELECT TOP (12)
        FORMAT(s.SaleDate, 'yyyy-MM') AS yearMonth,
        s.ProductName AS productName,
        SUM(COALESCE(s.Quantity, 0)) AS totalQuantity,
        SUM(COALESCE(s.Quantity, 0) * s.Amount) AS totalRevenue
    FROM dbo.Sales AS s
    JOIN dbo.Projects p ON p.ProjectId = s.ProjectId
    WHERE p.OrganizationId = ? {where_monthly}
    GROUP BY FORMAT(s.SaleDate, 'yyyy-MM'), s.ProductName
    ORDER BY yearMonth DESC, productName ASC;
    """
    monthly_rows = cur.execute(sql_monthly, monthly_params).fetchall()

    monthly = [
        {
            "yearMonth": r.yearMonth,
            "productName": r.productName,
            "totalQuantity": int(r.totalQuantity or 0),
            "totalRevenue": float(r.totalRevenue or 0.0),
        }
        for r in monthly_rows
    ]

    return {
        "organizationId": organization_id,
        "fromDate": from_date,
        "toDate": to_date,
        "topProducts": items,
        "salesMonthly": monthly,
    }


def context_as_bullets(ctx: Dict[str, Any]) -> str:
    """
    Serialize retrieved context to compact text for the LLM.
    """
    lines: List[str] = []
    lines.append(f"Organization: {ctx['organizationId']}")
    if ctx.get("fromDate"):
        lines.append(f"From: {ctx['fromDate']}")
    if ctx.get("toDate"):
        lines.append(f"To: {ctx['toDate']}")
    lines.append("Top products (qty, amount, preferred):")
    for it in ctx["topProducts"]:
        pref = it.get("preferredProviderName") or "n/a"
        lines.append(
            f"- {it['productName']}: qty={it['qty']}, amount={it['amount']:.2f}, preferred={pref}"
        )
    return "\n".join(lines)


# -----------------------------
# NEW: project-scoped AI context
# -----------------------------
def _rows(cur) -> List[Dict[str, Any]]:
    cols = [d[0] for d in cur.description] if cur.description else []
    out: List[Dict[str, Any]] = []
    for row in cur.fetchall():
        obj = {}
        for col, val in zip(cols, row):
            if isinstance(val, (datetime.date, datetime.datetime)):
                obj[col] = val.isoformat()
            elif isinstance(val, decimal.Decimal):
                # Convert to float for JSON safety
                obj[col] = float(val)
            else:
                obj[col] = val
        out.append(obj)
    return out


def fetch_project_context(project_id: str) -> Dict[str, Any]:
    """
    Calls: EXEC dbo.sp_GetAiProjectContext @ProjectId = ?
    Returns a JSON-able dict with keys:
      header, providers, providerProducts, inventory, sales, salesMonthly
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute("EXEC dbo.sp_GetAiProjectContext ?", project_id)

        # 1) header (single row expected)
        header_rows = _rows(cur)
        if not cur.nextset():
            raise RuntimeError("sp_GetAiProjectContext: missing Providers result")
        # 2) providers
        providers = _rows(cur)
        if not cur.nextset():
            raise RuntimeError(
                "sp_GetAiProjectContext: missing ProviderProducts result"
            )
        # 3) providerProducts
        provider_products = _rows(cur)
        if not cur.nextset():
            raise RuntimeError("sp_GetAiProjectContext: missing Inventory result")
        # 4) inventory
        inventory = _rows(cur)
        if not cur.nextset():
            raise RuntimeError("sp_GetAiProjectContext: missing Sales detail result")
        # 5) sales detail
        sales = _rows(cur)
        if not cur.nextset():
            raise RuntimeError("sp_GetAiProjectContext: missing Sales monthly result")
        # 6) sales monthly
        sales_monthly = _rows(cur)

        # Build the expected header shape
        if not header_rows:
            raise RuntimeError("Project not found for given ProjectId")
        h = header_rows[0]
        header = {
            "project": {
                "id": h.get("ProjectId"),
                "name": h.get("ProjectName"),
                "description": h.get("Description"),
                "status": h.get("Status"),
            },
            "organization": {
                "id": h.get("OrganizationId"),
                "name": h.get("OrganizationName"),
                "complianceStatus": h.get("ComplianceStatus"),
                "status": h.get("OrgStatus"),
            },
        }

        return {
            "header": header,
            "providers": providers,
            "providerProducts": provider_products,
            "inventory": inventory,
            "sales": sales,
            "salesMonthly": sales_monthly,
        }
    finally:
        conn.close()
