import { useState } from "react";
import "./Login.css";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function Login() {
  const { login, verificar2FA, cambiarPasswordObligatorio } = useAuth();
  const { tema, alternarTema } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [preToken, setPreToken] = useState(null);
  const [cambioPasswordToken, setCambioPasswordToken] = useState(null);
  const [passwordNuevo, setPasswordNuevo] = useState("");
  const [passwordConfirmar, setPasswordConfirmar] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Ingresa tu email y tu contraseña.");
      return;
    }

    setCargando(true);

    try {
      const resultado = await login(email.trim(), password);
      if (resultado.requiere2fa) {
        setPreToken(resultado.preToken);
      } else if (resultado.requiereCambioPassword) {
        setCambioPasswordToken(resultado.preToken);
      }
    } catch (e2) {
      console.error("Error al iniciar sesión", e2);
      if (!e2?.status || e2?.name === "TypeError" || e2?.status >= 502) {
        setError("Error de conexión con el servidor. Verifica tu conexión o que el backend esté disponible.");
      } else {
        setError(e2?.data?.error || "Credenciales inválidas.");
      }
    } finally {
      setCargando(false);
    }
  }

  async function handleVerificar2FA(e) {
    e.preventDefault();
    setError("");

    if (!codigo.trim()) {
      setError("Ingresa el código de tu app de autenticación.");
      return;
    }

    setCargando(true);

    try {
      const resultado = await verificar2FA(preToken, codigo.trim());
      if (resultado.requiereCambioPassword) {
        setPreToken(null);
        setCambioPasswordToken(resultado.preToken);
      }
    } catch (e2) {
      console.error("Error al verificar 2FA", e2);
      if (!e2?.status || e2?.name === "TypeError" || e2?.status >= 502) {
        setError("Error de conexión con el servidor. Verifica tu conexión o que el backend esté disponible.");
      } else {
        setError(e2?.data?.error || "Código incorrecto.");
      }
    } finally {
      setCargando(false);
    }
  }

  function cancelar2FA() {
    setPreToken(null);
    setCodigo("");
    setError("");
  }

  async function handleCambiarPasswordObligatorio(e) {
    e.preventDefault();
    setError("");

    if (!passwordNuevo || passwordNuevo.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (passwordNuevo !== passwordConfirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setCargando(true);

    try {
      await cambiarPasswordObligatorio(cambioPasswordToken, passwordNuevo);
    } catch (e2) {
      console.error("Error al cambiar la contraseña obligatoria", e2);
      if (!e2?.status || e2?.name === "TypeError" || e2?.status >= 502) {
        setError("Error de conexión con el servidor. Verifica tu conexión o que el backend esté disponible.");
      } else {
        setError(e2?.data?.error || "No se pudo actualizar la contraseña.");
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-shell">
      <button
        type="button"
        className="login-theme-toggle"
        onClick={alternarTema}
        aria-label={tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        title={tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      >
        {tema === "dark" ? "☀" : "🌙"}
      </button>

      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand__logo">XS</div>
          <div>
            <strong>XclusiveSetup CRM</strong>
            <span>Gestión comercial, financiera y operativa</span>
          </div>
        </div>

        {!preToken && !cambioPasswordToken ? (
          <>
            <h2>Iniciar sesión</h2>
            <p className="login-subtitle">
              Ingresa con tu cuenta para acceder al panel.
            </p>

            <form onSubmit={handleSubmit} className="login-form">
              {error && <p className="login-error">{error}</p>}

              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  autoComplete="username"
                  disabled={cargando}
                />
              </label>

              <label>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={cargando}
                />
              </label>

              <button type="submit" className="login-btn" disabled={cargando}>
                {cargando ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
          </>
        ) : cambioPasswordToken ? (
          <>
            <h2>Actualiza tu contraseña</h2>
            <p className="login-subtitle">
              Por seguridad, debes crear una nueva contraseña antes de continuar.
            </p>

            <form onSubmit={handleCambiarPasswordObligatorio} className="login-form">
              {error && <p className="login-error">{error}</p>}

              <label>
                Nueva contraseña
                <input
                  type="password"
                  value={passwordNuevo}
                  onChange={(e) => setPasswordNuevo(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  disabled={cargando}
                  autoFocus
                />
              </label>

              <label>
                Confirmar contraseña
                <input
                  type="password"
                  value={passwordConfirmar}
                  onChange={(e) => setPasswordConfirmar(e.target.value)}
                  placeholder="Repite la nueva contraseña"
                  autoComplete="new-password"
                  disabled={cargando}
                />
              </label>

              <button type="submit" className="login-btn" disabled={cargando}>
                {cargando ? "Guardando..." : "Guardar y continuar"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>Verificación en dos pasos</h2>
            <p className="login-subtitle">
              Ingresa el código de 6 dígitos de tu app de autenticación.
            </p>

            <form onSubmit={handleVerificar2FA} className="login-form">
              {error && <p className="login-error">{error}</p>}

              <label>
                Código
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  disabled={cargando}
                  autoFocus
                />
              </label>

              <button type="submit" className="login-btn" disabled={cargando}>
                {cargando ? "Verificando..." : "Verificar"}
              </button>

              <button
                type="button"
                className="login-link-btn"
                onClick={cancelar2FA}
                disabled={cargando}
              >
                Volver a iniciar sesión
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
