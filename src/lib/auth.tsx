import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, clearApiSession, jsonBody } from "@/lib/api";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  tenant: { id: string; name: string };
};

type AuthState = {
  user: AppUser | null;
  ready: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (
    fullName: string,
    companyName: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ user: AppUser }>("auth/me.php")
      .then(({ data }) => active && setUser(data.user))
      .catch(() => active && setUser(null))
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, remember = false) => {
    const { data } = await api<{ user: AppUser }>(
      "auth/login.php",
      { method: "POST", body: jsonBody({ email, password, remember }) },
      false,
    );
    setUser(data.user);
  }, []);
  const register = useCallback(
    async (
      fullName: string,
      companyName: string,
      email: string,
      password: string,
      confirmPassword: string,
    ) => {
      await api(
        "auth/register.php",
        {
          method: "POST",
          body: jsonBody({ fullName, companyName, email, password, confirmPassword }),
        },
        false,
      );
    },
    [],
  );
  const verifyEmail = useCallback(async (email: string, code: string) => {
    const { data } = await api<{ user: AppUser }>(
      "auth/verify-otp.php",
      { method: "POST", body: jsonBody({ email, code }) },
      false,
    );
    setUser(data.user);
  }, []);
  const resendOtp = useCallback(async (email: string) => {
    await api("auth/resend-otp.php", { method: "POST", body: jsonBody({ email }) }, false);
  }, []);
  const logout = useCallback(async () => {
    try {
      await api("auth/logout.php", { method: "POST" }, false);
    } finally {
      clearApiSession();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ready, login, register, verifyEmail, resendOtp, logout }),
    [user, ready, login, register, verifyEmail, resendOtp, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
