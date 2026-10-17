// Datos del local que se muestran en la web. Cambiarlos acá los actualiza en todas las pantallas.
export const siteConfig = {
  name: "Pedicuría Virginia",
  description: "Atención podológica con higiene, cuidado y calidez. Reservá tu turno online.",

  // TODO: completar con el usuario real de Instagram (sin @)
  instagramUser: "pedicuria_virginia",

  // TODO: completar con el número real. `whatsappNumber` va en formato internacional sin
  // espacios ni signos (ej. 5491112345678); `whatsappDisplay` es como se muestra en la web.
  whatsappNumber: "5491100000000",
  whatsappDisplay: "+54 9 291 433-2920",
  whatsappMessage: "¡Hola! Quería hacer una consulta",
};

export const instagramUrl = `https://instagram.com/${siteConfig.instagramUser}`;

export const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(
  siteConfig.whatsappMessage,
)}`;
