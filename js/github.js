// Lee y escribe la galería en el repo privado de la web (ATR-WEBS/BONFIRETATTOS-CODE).
// Cada cambio es un commit; el workflow de ese repo publica la web solo.

export const REPO = "ATR-WEBS/BONFIRETATTOS-CODE";
const RAMA = "main";
const DATOS = "src/data/tatuajes.json";
const FOTOS = "src/assets/tatuajes/";
const API = `https://api.github.com/repos/${REPO}`;

let token = "";
export const usarToken = (t) => { token = t; };

async function gh(ruta, {metodo = "GET", cuerpo, crudo = false} = {}) {
    const r = await fetch(ruta.startsWith("http") ? ruta : API + ruta, {
        method: metodo,
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: crudo ? "application/vnd.github.raw" : "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(cuerpo ? {"Content-Type": "application/json"} : {}),
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (!r.ok) {
        const e = new Error(r.status === 401 ? "El token no es válido o expiró."
            : r.status === 403 || r.status === 404 ? "El token no tiene permiso sobre el repo de la web."
            : `GitHub respondió ${r.status}.`);
        e.status = r.status;
        throw e;
    }
    return crudo ? r.blob() : r.json();
}

export async function comprobar() {
    const repo = await gh("");
    if (!repo.permissions?.push) throw new Error("El token sólo puede leer; necesita permiso de escritura (Contents).");
}

const deBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

async function estado() {
    const ref = await gh(`/git/ref/heads/${RAMA}`);
    const commit = await gh(`/git/commits/${ref.object.sha}`);
    const archivo = await gh(`/contents/${DATOS}?ref=${ref.object.sha}`);
    return {padre: ref.object.sha, arbol: commit.tree.sha, tatuajes: JSON.parse(deBase64(archivo.content))};
}

export async function leer() {
    return (await estado()).tatuajes;
}

export const fotoPrivada = (nombre) => gh(`/contents/${FOTOS}${encodeURIComponent(nombre)}?ref=${RAMA}`, {crudo: true});

const aBase64 = async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
};

// cambio(tatuajes) devuelve {tatuajes, nuevas: [{nombre, blob}], borrar: [nombre], mensaje}.
// Se vuelve a aplicar sobre lo último del repo si alguien publicó mientras tanto.
export async function guardar(cambio, alAvanzar = () => {}) {
    const subidas = new Map();
    for (let intento = 0; intento < 4; intento++) {
        const actual = await estado();
        const {tatuajes, nuevas = [], borrar = [], mensaje} = cambio(structuredClone(actual.tatuajes));
        const arbol = [];
        for (const [i, foto] of nuevas.entries()) {
            if (!subidas.has(foto.nombre)) {
                alAvanzar(`Subiendo foto ${i + 1} de ${nuevas.length}…`);
                const blob = await gh("/git/blobs", {metodo: "POST", cuerpo: {content: await aBase64(foto.blob), encoding: "base64"}});
                subidas.set(foto.nombre, blob.sha);
            }
            arbol.push({path: FOTOS + foto.nombre, mode: "100644", type: "blob", sha: subidas.get(foto.nombre)});
        }
        for (const nombre of borrar) arbol.push({path: FOTOS + nombre, mode: "100644", type: "blob", sha: null});
        arbol.push({path: DATOS, mode: "100644", type: "blob", content: JSON.stringify(tatuajes, null, 2) + "\n"});

        alAvanzar("Publicando…");
        const nuevoArbol = await gh("/git/trees", {metodo: "POST", cuerpo: {base_tree: actual.arbol, tree: arbol}});
        const commit = await gh("/git/commits", {metodo: "POST", cuerpo: {message: mensaje, tree: nuevoArbol.sha, parents: [actual.padre]}});
        try {
            await gh(`/git/refs/heads/${RAMA}`, {metodo: "PATCH", cuerpo: {sha: commit.sha}});
            return tatuajes;
        } catch (e) {
            if (e.status !== 422) throw e;
        }
    }
    throw new Error("El repo cambió varias veces seguidas; inténtalo de nuevo.");
}
