export default function AuditorPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-4">Welcome, Auditor</h1>
      <p className="text-gray-500">
        You have read-only access. Please contact an Admin if you need more permissions.
      </p>
    </div>
  );
}