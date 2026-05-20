import { useEffect, useState } from "react";
import { getValidations } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";

export default function QualityPage() {
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getValidations()
      .then((response) => setIssues(response.issues))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p>Calidad de datos</p>
          <h1>Validaciones</h1>
        </div>
      </header>
      {error && <div className="alert error">{error}</div>}
      {!error && (
        <DataTable columns={["severity", "type", "message", "count", "rows"]} rows={issues} />
      )}
    </div>
  );
}
