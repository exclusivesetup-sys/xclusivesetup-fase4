import { useEffect, useState } from "react";
import "./Usuarios.css";
import { apiRequest } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PageHeader from "../components/PageHeader";

const USUARIOS_API_PATH = "/api/usuarios";

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "gerente", label: "Gerente" },
  { value: "empleado", label: "Empleado" },
];

const initialForm = {
  nombre: "",
  email: "",
  password: "",
  rol: "empleado",
};

export default function Usuarios() {
  const { usuario: usuarioActual } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [formData, setFormData] = useState(initialForm);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [accionLoadingId, setAccionLoadingId] = useState(null);

  useEffect(() => {
    fetchUsuarios();
  }, []);

  async function fetchUsuarios() {
    setCargando(true);
    setError("");

    try {
      const data = await apiRequest(USUARIOS_API_PATH);
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando usuarios", e);
      setError("No se pudo cargar la lista de usuarios.");
    } finally {
      setCargando(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function resetForm() {
    setFormData(initialForm);
    setEditandoId(null);
  }

  function cancelarEdicion() {
    resetForm();
    setError("");
    setSuccessMsg("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!formData.nombre.trim() || (!editandoId && !formData.email.trim())) {
      setError("Nombre y email son obligatorios.");
      return;
    }

    if (!editandoId && (!formData.password || formData.password.length < 6)) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (editandoId && formData.password && formData.password.length < 6) {
      setError("Si vas a cambiar la contraseña, debe tener al menos 6 caracteres.");
      return;
    }

    setGuardando(true);

    try {
      if (editandoId == null) {
        const nuevo = await apiRequest(USUARIOS_API_PATH, {
          method: "POST",
          body: JSON.stringify({
            nombre: formData.nombre.trim(),
            email: formData.email.trim(),
            password: formData.password,
            rol: formData.rol,
          }),
        });

        setUsuarios((prev) => [...prev, nuevo]);
        setSuccessMsg(
          "Usuario creado correctamente. Deberá cambiar esta contraseña en su primer inicio de sesión."
        );
      } else {
        const payload = {
          nombre: formData.nombre.trim(),
          rol: formData.rol,
          activo: true,
        };

        if (formData.password) {
          payload.password = formData.password;
        }

        const actualizado = await apiRequest(
          `${USUARIOS_API_PATH}/${editandoId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );

        setUsuarios((prev) =>
          prev.map((u) => (u.id === editandoId ? { ...u, ...actualizado } : u))
        );
        setSuccessMsg(
          actualizado.debe_cambiar_password
            ? "Usuario actualizado correctamente. Deberá cambiar la nueva contraseña en su próximo inicio de sesión."
            : "Usuario actualizado correctamente."
        );
      }

      resetForm();
    } catch (e) {
      console.error("Error guardando usuario", e);
      setError(
        e?.data?.error ||
          (editandoId == null
            ? "No se pudo crear el usuario."
            : "No se pudo actualizar el usuario.")
      );
    } finally {
      setGuardando(false);
    }
  }

  function handleEdit(u) {
    setEditandoId(u.id);
    setError("");
    setSuccessMsg("");
    setFormData({
      nombre: u.nombre || "",
      email: u.email || "",
      password: "",
      rol: u.rol || "empleado",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleActivo(u) {
    setAccionLoadingId(u.id);
    setError("");
    setSuccessMsg("");

    try {
      const actualizado = await apiRequest(`${USUARIOS_API_PATH}/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nombre: u.nombre,
          rol: u.rol,
          activo: !u.activo,
        }),
      });

      setUsuarios((prev) =>
        prev.map((item) => (item.id === u.id ? { ...item, ...actualizado } : item))
      );
    } catch (e) {
      console.error("Error cambiando estado del usuario", e);
      setError(e?.data?.error || "No se pudo cambiar el estado del usuario.");
    } finally {
      setAccionLoadingId(null);
    }
  }

  async function handleDelete(u) {
    const confirmar = window.confirm(
      `¿Seguro que quieres eliminar a "${u.nombre}"?`
    );
    if (!confirmar) return;

    setAccionLoadingId(u.id);
    setError("");
    setSuccessMsg("");

    try {
      await apiRequest(`${USUARIOS_API_PATH}/${u.id}`, { method: "DELETE" });
      setUsuarios((prev) => prev.filter((item) => item.id !== u.id));
      setSuccessMsg("Usuario eliminado correctamente.");
    } catch (e) {
      console.error("Error eliminando usuario", e);
      setError(e?.data?.error || "No se pudo eliminar el usuario.");
    } finally {
      setAccionLoadingId(null);
    }
  }

  return (
    <div className="page usuarios-page">
      <PageHeader
        title="Usuarios"
        description="Administra las cuentas del equipo, sus roles y su acceso al panel."
      />

      <section className="usuarios-section">
        <h3>{editandoId ? "Editar usuario" : "Nuevo usuario"}</h3>

        {error && <p className="usuarios-error">{error}</p>}
        {successMsg && <p className="usuarios-success">{successMsg}</p>}

        <form onSubmit={handleSubmit} className="usuarios-form">
          <div className="usuarios-grid">
            <label>
              Nombre
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. María Pérez"
                disabled={guardando}
              />
            </label>

            <label>
              Email
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="maria@empresa.com"
                disabled={guardando || editandoId != null}
              />
            </label>

            <label>
              {editandoId ? "Nueva contraseña (opcional)" : "Contraseña"}
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 6 caracteres"
                disabled={guardando}
              />
            </label>

            <label>
              Rol
              <select
                name="rol"
                value={formData.rol}
                onChange={handleChange}
                disabled={guardando}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="usuarios-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando
                ? "Guardando..."
                : editandoId
                ? "Guardar cambios"
                : "Crear usuario"}
            </button>

            {editandoId && (
              <button
                type="button"
                className="btn-secondary"
                onClick={cancelarEdicion}
                disabled={guardando}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="usuarios-section">
        <h3>Equipo</h3>

        {cargando ? (
          <p className="usuarios-empty">Cargando usuarios...</p>
        ) : usuarios.length === 0 ? (
          <p className="usuarios-empty">Aún no tienes usuarios registrados.</p>
        ) : (
          <div className="usuarios-table-wrap">
            <table className="usuarios-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const esYoMismo = u.id === usuarioActual?.id;
                  const bloqueado = accionLoadingId === u.id;

                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.nombre}</strong>
                        {esYoMismo && <span className="usuarios-tag-tu">Tú</span>}
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`usuarios-rol usuarios-rol--${u.rol}`}>
                          {ROLES.find((r) => r.value === u.rol)?.label || u.rol}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`usuarios-estado ${
                            u.activo ? "usuarios-estado--activo" : "usuarios-estado--inactivo"
                          }`}
                        >
                          {u.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <div className="usuarios-row-actions">
                          <button
                            type="button"
                            className="chip chip-edit"
                            onClick={() => handleEdit(u)}
                            disabled={bloqueado}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="chip"
                            onClick={() => toggleActivo(u)}
                            disabled={bloqueado || esYoMismo}
                          >
                            {u.activo ? "Desactivar" : "Activar"}
                          </button>

                          <button
                            type="button"
                            className="chip chip-delete"
                            onClick={() => handleDelete(u)}
                            disabled={bloqueado || esYoMismo}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
