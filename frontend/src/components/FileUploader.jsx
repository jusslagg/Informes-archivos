import { Upload } from "lucide-react";

export default function FileUploader({ onFile, loading }) {
  return (
    <label className={loading ? "uploader loading" : "uploader"}>
      <Upload size={28} />
      <strong>{loading ? "Procesando archivo..." : "Seleccionar nómina"}</strong>
      <span>Excel o CSV</span>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        disabled={loading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
