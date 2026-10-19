// Prepara las fotos del carrete para la web: orientación correcta, máximo 1400 px
// por lado y JPEG. Las fotos actuales de la galería tienen ese tamaño.

const LADO = 1400;
const CALIDAD = 0.8;

export async function preparar(archivo) {
    const img = await createImageBitmap(archivo, {imageOrientation: "from-image"});
    const escala = Math.min(1, LADO / Math.max(img.width, img.height));
    const w = Math.round(img.width * escala);
    const h = Math.round(img.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    img.close?.();
    const blob = await new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo leer la foto."))), "image/jpeg", CALIDAD));
    canvas.width = canvas.height = 0;
    return blob;
}

export const nombreNuevo = (i) => {
    const t = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    return `tatuaje-${t}-${i + 1}.jpg`;
};
