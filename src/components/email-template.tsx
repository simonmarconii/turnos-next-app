interface EmailTemplateProps {
    name: string;
    lastname: string;
    date: string;
    time: string;
    serviceName: string;
    summaryUrl?: string;
    pending?: boolean;
    newAccount?: boolean;
    loginUrl?: string;
}

export default function EmailTemplate({ name, lastname, date, time, serviceName, summaryUrl, pending = false, newAccount = false, loginUrl }: EmailTemplateProps) {
    return (
        <div>
            <h1>¡Hola, {name} {lastname}!</h1>
            <p>{pending ? "Recibimos tu solicitud de turno" : "Tenes un turno reservado"} para el servicio {serviceName}</p>
            <p className="font-bold">Dia: {date}</p>
            <p className="font-bold">Hora: {time}</p>
            {summaryUrl && <p><a href={summaryUrl}>Ver los datos de tu turno</a></p>}
            {newAccount && (
                <p>
                    Creamos una cuenta con este email. La próxima vez que saques un turno elegí &quot;Ya tengo cuenta&quot;.
                    Si querés iniciar sesión, entrá a &quot;Ingresar&quot; y tocá &quot;¿Olvidaste tu contraseña?&quot; para crear tu contraseña
                    {loginUrl ? <> (<a href={loginUrl}>crear mi contraseña</a>)</> : null}.
                </p>
            )}
        </div>
    );
}
