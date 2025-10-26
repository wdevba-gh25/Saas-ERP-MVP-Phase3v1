export interface SignUpPayload {
  email: string;
  password: string;
  organizationName: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  organizationId: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
}