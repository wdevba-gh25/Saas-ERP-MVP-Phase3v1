export function setAuthToken(token: string): void {
  localStorage.setItem("authToken", token);
}

export function getAuthToken(): string | null {
  return localStorage.getItem("authToken");
}

export function clearAuthToken(): void {
  localStorage.removeItem("authToken");
}