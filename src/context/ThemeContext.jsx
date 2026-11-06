import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);
const THEME_STORAGE_KEY = "xs_theme";

function obtenerTemaInicial() {
  const guardado = localStorage.getItem(THEME_STORAGE_KEY);
  if (guardado === "light" || guardado === "dark") return guardado;

  const prefiereClaro =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  return prefiereClaro ? "light" : "dark";
}

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(obtenerTemaInicial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    localStorage.setItem(THEME_STORAGE_KEY, tema);
  }, [tema]);

  function alternarTema() {
    setTema((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <ThemeContext.Provider value={{ tema, alternarTema }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme debe usarse dentro de un ThemeProvider");
  }
  return ctx;
}
