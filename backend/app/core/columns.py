import unicodedata


CORE_COLUMNS = [
    "LEGAJO",
    "APELLIDOS",
    "NOMBRES",
    "DOCUMENTO",
    "FECHA ALTA",
    "FECHA BAJA",
    "ESTADO",
    "ÁREA",
    "SUB ÁREA",
    "PUESTO",
    "CLIENTE",
    "CAMPAÑA",
    "SUB CAMPAÑA",
    "CENTRO COSTO",
    "CARGA HORARIA SEMANAL",
    "SALARIO",
    "MODALIDAD DE CONTRATACIÓN",
    "HORARIO CONTRACTUAL",
    "EMPLEADOR",
    "LOCALIDAD",
    "MULTICAMPAÑA",
]

OPTIONAL_COLUMNS = [
    "SEXO",
    "FECHA NACIMIENTO",
    "SITIO",
    "PRESENCIALIDAD",
    "EQUIPO",
    "FORMADOR ASIGNADO",
    "MOTIVO BAJA",
]

USER_COLUMNS = [
    "USUARIO TECO",
    "USUARIO CACHAMAI",
    "USUARIO ORION/NATURGY",
    "USUARIO SANTANDER",
    "USUARIO GETNET",
    "USUARIO GENESYS",
    "USUARIO YOIZEN",
]

INCLUDE_USER_COLUMNS = False


def normalize_column_name(value: str) -> str:
    text = str(value).strip().upper()
    text = " ".join(text.replace("_", " ").replace("-", " ").split())
    return "".join(
        char for char in unicodedata.normalize("NFKD", text) if not unicodedata.combining(char)
    )


def active_columns() -> list[str]:
    columns = [*CORE_COLUMNS, *OPTIONAL_COLUMNS]
    if INCLUDE_USER_COLUMNS:
        columns.extend(USER_COLUMNS)
    return columns


CANONICAL_COLUMN_MAP = {
    normalize_column_name(column): column for column in [*CORE_COLUMNS, *OPTIONAL_COLUMNS, *USER_COLUMNS]
}
