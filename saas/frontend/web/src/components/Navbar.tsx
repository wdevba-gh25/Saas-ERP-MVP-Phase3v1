import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";

export default function Navbar() {
  const { token, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg">SaaSMvp</Link>
        <div className="flex items-center gap-3">
          {!token ? (
            <>
              {pathname !== "/login" && (
                <Link className="link" to="/login">
                  Login
                </Link>
              )}
              {pathname !== "/signup" && (
                <Link className="btn-secondary" to="/signup">
                  Sign up
                </Link>
              )}
            </>
          ) : (
            <>
              <span className="text-sm text-gray-700">
                {user?.displayName || user?.email || "User"}
              </span>
              <button
                className="btn-secondary"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}