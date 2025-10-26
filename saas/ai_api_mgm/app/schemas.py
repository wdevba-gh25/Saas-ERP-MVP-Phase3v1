from pydantic import BaseModel, Field
from typing import List, Optional

# ---- Requests ----


class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1)


class ExtractRequest(BaseModel):
    text: str = Field(..., min_length=1)


class RecommendRequest(BaseModel):  
    organizationId: Optional[str] = None
    fromDate: Optional[str] = None
    toDate: Optional[str] = None
    topN: Optional[int] = 10 # number of recommendations to retrieve (default: 10)


class RAGRecommendRequest(BaseModel):
    organizationId: str
    fromDate: Optional[str] = None
    toDate: Optional[str] = None
    topN: Optional[int] = 10


# ---- Responses ----


class SummarizeResponse(BaseModel):
    summary: str


class ExtractResponse(BaseModel):
    items: List[str]


class RecommendResponse(BaseModel):
    title: str
    summary: str
    recommendations: List[str]
    pdfUrl: str


# -------- NEW: AI Tools by project --------
class AiProjectRequest(BaseModel):
    projectId: str = Field(..., min_length=36, max_length=36)
    visualize: Optional[bool] = False

# ---- Chatbot (ERP-scoped) ----
class ChatbotAskRequest(BaseModel):
    projectId: str = Field(..., min_length=36, max_length=36)
    question: str = Field(..., min_length=2)
