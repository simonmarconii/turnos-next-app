import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { siteConfig } from "@/config/site";

// Template único para todos los emails de turnos (reserva, reprogramación, cancelación), para el
// cliente y para el admin. Los textos de cada caso se arman en src/lib/notifications.ts.
//
// Los clientes de correo (Gmail, Outlook) ignoran las clases CSS: todos los estilos van inline.
// Los colores son los de la sección 7.1 de la doc; las fuentes del sitio no cargan en la mayoría
// de los clientes, así que se usa una pila de fuentes del sistema parecida.

export type EmailTemplateProps = {
  // Texto que se ve en la bandeja de entrada antes de abrir el email
  preview: string;
  title: string;
  // Párrafos debajo del título
  intro: string[];
  // Datos del turno (y del cliente, en los emails al admin)
  rows: [label: string, value: string][];
  // Avisos destacados: cómo iniciar sesión, reembolsos, etc.
  notes?: string[];
  cta?: { label: string; url: string };
};

const colors = {
  background: "#f4ebdf",
  surface: "#ffffff",
  primary: "#4f6f63",
  accent: "#b8976a",
  foreground: "#2f2a26",
  muted: "#6b625b",
  line: "#e0d3c2",
  soft: "#e2ece6",
};

const fontFamily = "Nunito, 'Segoe UI', Helvetica, Arial, sans-serif";

export default function EmailTemplate({
  preview,
  title,
  intro,
  rows,
  notes = [],
  cta,
}: EmailTemplateProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.background, fontFamily, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "0 16px" }}>
          <Text
            style={{
              color: colors.primary,
              fontSize: "20px",
              fontWeight: 700,
              textAlign: "center",
              margin: "0 0 16px",
            }}
          >
            {siteConfig.name}
          </Text>

          <Section
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.line}`,
              borderRadius: "16px",
              padding: "32px 28px",
            }}
          >
            <Heading
              as="h1"
              style={{ color: colors.foreground, fontSize: "24px", lineHeight: "1.3", margin: "0 0 16px" }}
            >
              {title}
            </Heading>

            {intro.map((paragraph) => (
              <Text
                key={paragraph}
                style={{ color: colors.foreground, fontSize: "16px", lineHeight: "1.6", margin: "0 0 12px" }}
              >
                {paragraph}
              </Text>
            ))}

            <Section
              style={{
                border: `1px solid ${colors.line}`,
                borderRadius: "12px",
                padding: "4px 16px",
                margin: "20px 0",
              }}
            >
              {rows.map(([label, value], index) => (
                <table
                  key={label}
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                  style={{
                    borderBottom: index < rows.length - 1 ? `1px solid ${colors.line}` : "none",
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ color: colors.muted, fontSize: "14px", padding: "12px 0", width: "40%" }}>
                        {label}
                      </td>
                      <td
                        style={{
                          color: colors.foreground,
                          fontSize: "15px",
                          fontWeight: 700,
                          padding: "12px 0",
                          textAlign: "right",
                        }}
                      >
                        {value}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </Section>

            {notes.map((note) => (
              <Text
                key={note}
                style={{
                  backgroundColor: colors.soft,
                  borderRadius: "12px",
                  color: colors.foreground,
                  fontSize: "14px",
                  lineHeight: "1.6",
                  margin: "0 0 12px",
                  padding: "12px 16px",
                }}
              >
                {note}
              </Text>
            ))}

            {cta && (
              <Section style={{ textAlign: "center", marginTop: "24px" }}>
                <Button
                  href={cta.url}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: "999px",
                    color: "#ffffff",
                    fontSize: "15px",
                    fontWeight: 700,
                    padding: "14px 28px",
                    textDecoration: "none",
                  }}
                >
                  {cta.label}
                </Button>
              </Section>
            )}
          </Section>

          <Hr style={{ borderColor: colors.accent, margin: "24px 0 12px", opacity: 0.5 }} />
          <Text style={{ color: colors.muted, fontSize: "12px", textAlign: "center", margin: 0 }}>
            {siteConfig.name} · WhatsApp {siteConfig.whatsappDisplay}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
