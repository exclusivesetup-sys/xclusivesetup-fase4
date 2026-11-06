import { createContext, useContext, useEffect, useState } from "react";
import { apiRequest, getToken, setToken, clearToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    restaurarSesion();

    function handleUnauthorized() {
      setUsuario(null);
    }

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  async function restaurarSesion() {
    const token = getToken();

    if (!token) {
      setCargando(false);
      return;
    }

    try {
      const data = await apiRequest("/api/auth/me");
      setUsuario(data?.usuario || null);
    } catch (e) {
      console.error("No se pudo restaurar la sesión", e);
      clearToken();
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }

  async function login(email, password) {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (data.requiere2fa) {
      return { requiere2fa: true, preToken: data.preToken };
    }

    if (data.requiereCambioPassword) {
      return { requiereCambioPassword: true, preToken: data.preToken };
    }

    setToken(data.token);
    setUsuario(data.usuario);
    return { requiere2fa: false, usuario: data.usuario };
  }

  async function verificar2FA(preToken, codigo) {
    const data = await apiRequest("/api/auth/login/verificar-2fa", {
      method: "POST",
      body: JSON.stringify({ preToken, codigo }),
    });

    if (data.requiereCambioPassword) {
      return { requiereCambioPassword: true, preToken: data.preToken };
    }

    setToken(data.token);
    setUsuario(data.usuario);
    return { requiereCambioPassword: false, usuario: data.usuario };
  }

  async function cambiarPasswordObligatorio(preToken, passwordNuevo) {
    const data = await apiRequest("/api/auth/cambiar-password-obligatorio", {
      method: "POST",
      body: JSON.stringify({ preToken, password_nuevo: passwordNuevo }),
    });

    setToken(data.token);
    setUsuario(data.usuario);
    return data.usuario;
  }

  async function refrescarUsuario() {
    try {
      const data = await apiRequest("/api/auth/me");
      setUsuario(data?.usuario || null);
    } catch (e) {
      console.error("No se pudo refrescar el usuario", e);
    }
  }

  function logout() {
    clearToken();
    setUsuario(null);
  }

  const value = {
    usuario,
    cargando,
    autenticado: Boolean(usuario),
    esAdmin: usuario?.rol === "admin",
    esAdminOGerente: usuario?.rol === "admin" || usuario?.rol === "gerente",
    login,
    verificar2FA,
    cambiarPasswordObligatorio,
    refrescarUsuario,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return ctx;
}
