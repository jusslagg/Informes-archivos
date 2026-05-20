import { useState } from "react";
import { uploadPayroll } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import FileUploader from "../components/FileUploader.jsx";

export default function UploadPage({ navigate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleFile = async (file) => {
    setLoading(true);
    setError("");
    try {
      const response = await uploadPayroll(file);
      setResult(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p>Importación</p>
          <h1>Cargar nómina</h1>
        </div>
        {result && (
          <button className="primary-button" onClick={() => navigate("dashboard")}>
            Ver dashboard
          </button>
        )}
      </header>

      <FileUploader onFile={handleFile} loading={loading} />
      {error && <div className="alert error">{error}</div>}

      {result && (
        <section className="panel">
          <h2>Resultado de procesamiento</h2>
          <div className="summary-grid">
            <div>
              <span>Filas procesadas</span>
              <strong>{result.rows}</strong>
            </div>
            <div>
              <span>Columnas faltantes</span>
              <strong>{result.missing_core_columns.length}</strong>
            </div>
            <div>
              <span>Alertas de calidad</span>
              <strong>{result.validations.length}</strong>
            </div>
          </div>
          <DataTable
            columns={["severity", "type", "message", "count"]}
            rows={result.validations}
          />
        </section>
      )}
    </div>
  );
}
