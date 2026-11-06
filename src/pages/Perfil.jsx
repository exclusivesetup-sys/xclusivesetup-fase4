import { useState } from "react";
import "./Perfil.css";
import { apiRequest } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PageHeader from "../components/PageHeader";

const ROL_LABELS = {
  admin: "Administrador",
  gerente: "Gerente",
  empleado: "Empleado",
};

export default function Perfil() {
  const { usuario, refrescarUsuario } = useAuth();

  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNuevo, setPasswordNuevo] = useState("");
  const [passwordConfirmar, setPasswordConfirmar] = useState("");
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState("");
  const [successPassword, setSuccessPassword] = useState("");

  const [qr, setQr] = useState(null);
  const [codigoActivar, setCodigoActivar] = useState("");
  const [generando2FA, setGenerando2FA] = useState(false);
  const [activando2FA, setActivando2FA] = useState(false);
  const [error2FA, setError2FA] = useState("");
  const [success2FA, setSuccess2FA] = useState("");

  const [passwordDesactivar, setPasswordDesactivar] = useState("");
  const [desactivando2FA, setDesactivando2FA] = useState(false);

  async function handleCambiarPassword(e) {
    e.preventDefault();
    setErrorPassword("");
    setSuccessPassword("");

    if (!passwordActual || !passwordNuevo) {
      setErrorPassword("Completa tu contraseña actual y la nueva.");
      return;
    }

    if (passwordNuevo !== passwordConfirmar) {
      setErrorPassword("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    setGuardandoPassword(true);

    try {
      await apiRequest("/api/auth/cambiar-password", {
        method: "PUT",
        body: JSON.stringify({
          password_actual: passwordActual,
          password_nuevo: passwordNuevo,
        }),
      });

      setSuccessPassword("Contraseña actualizada correctamente.");
      setPasswordActual("");
      setPasswordNuevo("");
      setPasswordConfirmar("");
    } catch (e2) {
      console.error("Error cambiando contraseña", e2);
      setErrorPassword(e2?.data?.error || "No se pudo cambiar la contraseña.");
    } finally {
      setGuardandoPassword(false);
    }
  }

  async function handleGenerar2FA() {
    setError2FA("");
    setSuccess2FA("");
    setGenerando2FA(true);

    try {
      const data = await apiRequest("/api/auth/2fa/generar", { method: "POST" });
      setQr(data);
    } catch (e) {
      console.error("Error generando 2FA", e);
      setError2FA(e?.data?.error || "No se pudo generar la configuración de 2FA.");
    } finally {
      setGenerando2FA(false);
    }
  }

  async function handleActivar2FA(e) {
    e.preventDefault();
    setError2FA("");
    setSuccess2FA("");

    if (!codigoActivar.trim()) {
      setError2FA("Ingresa el código de 6 dígitos de tu app de autenticación.");
      return;
    }

    setActivando2FA(true);

    try {
      await apiRequest("/api/auth/2fa/activar", {
        method: "POST",
        body: JSON.stringify({ codigo: codigoActivar.trim() }),
      });

      setSuccess2FA("Verificación en dos pasos activada correctamente.");
      setQr(null);
      setCodigoActivar("");
      await refrescarUsuario();
    } catch (e) {
      console.error("Error activando 2FA", e);
      setError2FA(e?.data?.error || "No se pudo activar la verificación en dos pasos.");
    } finally {
      setActivando2FA(false);
    }
  }

  async function handleDesactivar2FA(e) {
    e.preventDefault();
    setError2FA("");
    setSuccess2FA("");

    if (!passwordDesactivar) {
      setError2FA("Ingresa tu contraseña para desactivar la verificación en dos pasos.");
      return;
    }

    setDesactivando2FA(true);

    try {
      await apiRequest("/api/auth/2fa/desactivar", {
        method: "POST",
        body: JSON.stringify({ password: passwordDesactivar }),
      });

      setSuccess2FA("Verificación en dos pasos desactivada.");
      setPasswordDesactivar("");
      await refrescarUsuario();
    } catch (e) {
      console.error("Error desactivando 2FA", e);
      setError2FA(e?.data?.error || "No se pudo desactivar la verificación en dos pasos.");
    } finally {
      setDesactivando2FA(false);
    }
  }

  return (
    <div className="page perfil-page">
      <PageHeader
        title="Mi perfil"
        description="Administra tu contraseña y la verificación en dos pasos de tu cuenta."
      />

      <section className="perfil-section">
        <h3>Datos de la cuenta</h3>
        <div className="perfil-datos">
          <div>
            <span className="label">Nombre</span>
            <p>{usuario?.nombre}</p>
          </div>
          <div>
            <span className="label">Email</span>
            <p>{usuario?.email}</p>
          </div>
          <div>
            <span className="label">Rol</span>
            <p>{ROL_LABELS[usuario?.rol] || usuario?.rol}</p>
          </div>
        </div>
      </section>

      <section className="perfil-section">
        <h3>Cambiar contraseña</h3>

        {errorPassword && <p className="perfil-error">{errorPassword}</p>}
        {successPassword && <p className="perfil-success">{successPassword}</p>}

        <form onSubmit={handleCambiarPassword} className="perfil-form">
          <label>
            Contraseña actual
            <input
              type="password"
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
              disabled={guardandoPassword}
            />
          </label>

          <label>
            Nueva contraseña
            <input
              type="password"
              value={passwordNuevo}
              onChange={(e) => setPasswordNuevo(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              disabled={guardandoPassword}
            />
          </label>

          <label>
            Confirmar nueva contraseña
            <input
              type="password"
              value={passwordConfirmar}
              onChange={(e) => setPasswordConfirmar(e.target.value)}
              disabled={guardandoPassword}
            />
          </label>

          <button type="submit" className="btn-primary" disabled={guardandoPassword}>
            {guardandoPassword ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      </section>

      <section className="perfil-section">
        <h3>Verificación en dos pasos (2FA)</h3>
        <p className="perfil-hint">
          Usa una app como Google Authenticator, Authy o similar para generar códigos
          de 6 dígitos al iniciar sesión.
        </p>

        {error2FA && <p className="perfil-error">{error2FA}</p>}
        {success2FA && <p className="perfil-success">{success2FA}</p>}

        {usuario?.totp_habilitado ? (
          <>
            <p className="perfil-2fa-estado perfil-2fa-estado--activo">
              La verificación en dos pasos está <strong>activada</strong>.
            </p>

            <form onSubmit={handleDesactivar2FA} className="perfil-form-inline">
              <label>
                Contraseña actual
                <input
                  type="password"
                  value={passwordDesactivar}
                  onChange={(e) => setPasswordDesactivar(e.target.value)}
                  disabled={desactivando2FA}
                />
              </label>

              <button
                type="submit"
                className="btn-danger-outline"
                disabled={desactivando2FA}
              >
                {desactivando2FA ? "Desactivando..." : "Desactivar 2FA"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="perfil-2fa-estado">
              La verificación en dos pasos está <strong>desactivada</strong>.
            </p>

            {!qr ? (
              <button
                type="button"
                className="btn-primary"
                onClick={handleGenerar2FA}
                disabled={generando2FA}
              >
                {generando2FA ? "Generando..." : "Configurar 2FA"}
              </button>
            ) : (
              <div className="perfil-2fa-setup">
                <p>
                  Escanea este código QR con tu app de autenticación, o ingresa
                  manualmente esta clave:
                </p>
                <code className="perfil-2fa-secreto">{qr.secreto}</code>
                <img src={qr.qr} alt="Código QR para configurar 2FA" className="perfil-2fa-qr" />

                <form onSubmit={handleActivar2FA} className="perfil-form-inline">
                  <label>
                    Código de verificación
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={codigoActivar}
                      onChange={(e) => setCodigoActivar(e.target.value)}
                      placeholder="123456"
                      disabled={activando2FA}
                    />
                  </label>

                  <button type="submit" className="btn-primary" disabled={activando2FA}>
                    {activando2FA ? "Activando..." : "Confirmar y activar"}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
