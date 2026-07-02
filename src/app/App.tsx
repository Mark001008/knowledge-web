import { useMemo, useState } from "react";
import { LoginPage } from "../features/auth/LoginPage";
import { WorkspaceApp } from "../features/workspace/WorkspaceApp";
import { clearAuthSession, readAuthSession, saveAuthSession } from "../services/authSession";
import type { LoginResponse, UserInfo } from "../shared/types/domain";

export function App() {
  const [session, setSession] = useState<LoginResponse | null>(() => readAuthSession());
  const user = useMemo<UserInfo>(() => session?.user || {}, [session]);

  function handleLogin(loginData: LoginResponse, remember: boolean) {
    saveAuthSession(loginData, remember);
    setSession(loginData);
  }

  function handleLogout() {
    clearAuthSession();
    setSession(null);
  }

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <WorkspaceApp user={user} onLogout={handleLogout} />;
}
