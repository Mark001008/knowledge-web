import { useEffect, useMemo, useState } from "react";
import { LoginPage } from "../features/auth/LoginPage";
import { WorkspaceApp } from "../features/workspace/WorkspaceApp";
import { AUTH_REQUIRED_EVENT, clearAuthSession, readAuthSession, saveAuthSession } from "../services/authSession";
import type { LoginResponse, UserInfo } from "../shared/types/domain";
import type { MenuDTO } from "../shared/types/system";

export function App() {
  const [session, setSession] = useState<LoginResponse | null>(() => readAuthSession());
  const user = useMemo<UserInfo>(() => session?.user || {}, [session]);
  const permissions = useMemo<string[]>(() => session?.permissions || [], [session]);
  const menus = useMemo<MenuDTO[]>(() => session?.menus || [], [session]);

  function handleLogin(loginData: LoginResponse, remember: boolean) {
    saveAuthSession(loginData, remember);
    setSession(loginData);
  }

  function handleLogout() {
    clearAuthSession();
    setSession(null);
  }

  useEffect(() => {
    function handleAuthRequired() {
      setSession(null);
    }

    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <WorkspaceApp
      token={session.accessToken}
      user={user}
      permissions={permissions}
      menus={menus}
      onLogout={handleLogout}
    />
  );
}
