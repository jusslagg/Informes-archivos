import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";

const root = createRoot(document.getElementById("root"));

function renderBootError(error) {
  root.render(
    <div className="alert error" style={{ margin: 24 }}>
      No se pudo iniciar la app: {error?.message || "error inesperado"}
    </div>,
  );
}

import("./App.jsx")
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch(renderBootError);
