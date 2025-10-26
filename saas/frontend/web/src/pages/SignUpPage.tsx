import { useNavigate, Link } from "react-router-dom";
import SignUpForm from "../components/SignUpForm";
import { useAuthStore } from "../store/auth.store";

export default function SignUpPage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();

  if (token) {
    navigate("/projects");
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold mb-2">Create your account</h1>
      <p className="text-sm text-gray-600 mb-6">
        Already have an account?{" "}
        <Link className="text-blue-600 hover:underline" to="/login">
          Sign in
        </Link>
      </p>
      <div className="bg-white rounded-2xl shadow p-6">
        <SignUpForm onSignedUp={() => navigate("/projects")} />
      </div>
    </div>
  );
}