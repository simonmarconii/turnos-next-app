import type { ReactElement } from "react";
import { resend } from "@/lib/resend";

export type SendEmailInput = {
    to: string | string[];
    subject: string;
    react: ReactElement;
    from?: string;
};

export function formatEmailDateTime(rawDate: Date) {
    const realDate = new Date(rawDate);
    const date = realDate.toLocaleDateString("es-AR", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        timeZone: "America/Argentina/Buenos_Aires",
    });
    const time = realDate.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Argentina/Buenos_Aires",
    });

    return { date, time };
}

export async function sendEmail({ to, subject, react, from }: SendEmailInput) {
    const { data, error } = await resend.emails.send({
        from: from ?? process.env.EMAIL_FROM!,
        to,
        subject,
        react,
    });

    if (error) throw new Error(error.message);

    return data;
}
