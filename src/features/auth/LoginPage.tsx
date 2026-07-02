import { type FormEvent, useState } from "react";
import { loginWithPassword } from "../../services/authApi";
import type { LoginResponse } from "../../shared/types/domain";

interface LoginPageProps {
  onLogin: (loginData: LoginResponse, remember: boolean) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("请输入用户名和密码");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const loginData = await loginWithPassword(username, password);
      onLogin(loginData, remember);
    } catch (loginError) {
      setError(loginError instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (loginError as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-label="企业知识库登录">
        <aside className="login-intro">
          <div className="login-brand">
            <span className="brand-mark">KB</span>
            <span>知识库工作台</span>
          </div>
        </aside>

        <section className="login-panel">
          <div className="login-heading">
            <p className="login-kicker">Account</p>
            <h2>欢迎回来</h2>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              用户名
              <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="login-options">
              <label className="check-row">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span>保持登录</span>
              </label>
              <button className="link-btn" type="button">
                忘记密码
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" className="primary-btn full-width" disabled={submitting}>
              {submitting ? "登录中" : "登录"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
