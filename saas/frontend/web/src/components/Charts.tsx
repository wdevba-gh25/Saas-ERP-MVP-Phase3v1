import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export default function DynamicChart({ data }: { data: any }) {
  if (!data || !data.type) return <div>No chart data</div>;

  return (
    <div className="w-full h-64">
      <ResponsiveContainer>
        {data.type === "bar" ? (
          <BarChart data={data.values.map((v: any, i: number) => ({ label: data.labels[i], value: v }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#8884d8" />
          </BarChart>
        ) : (
          <LineChart data={data.values.map((v: any, i: number) => ({ label: data.labels[i], value: v }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#82ca9d" />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}