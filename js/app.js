import * as gh from "./github.js?v=f3309cf";
import {preparar, nombreNuevo} from "./fotos.js?v=f3309cf";

const WEB = "https://atr-webs.github.io/BONFIRETATTOS-WEB/";
const CLAVE = "bonfire-token";
const ALT = "Tatuaje de Bonfire Tattoos";

const $ = (s) => document.querySelector(s);
const vistas = {conectar: $("#conectar"), galeria: $("#galeria"), nuevo: $("#nuevo")};
const lista = $("#lista");
const fotosNuevas = $("#fotosNuevas");
const archivos = $("#archivos");

let tatuajes = [];
let ordenando = false;
let cambiado = false;
let nuevas = [];
let ocupado = false;
let vistos = new Set();
let vigilancia = 0;
const minisWeb = new Map();
const minisLocales = new Map();

const raiz = (nombre) => nombre.replace(/\.[^.]+$/, "");
const leerToken = () => { try { return localStorage.getItem(CLAVE) || ""; } catch { return ""; } };
const guardarToken = (t) => { try { t ? localStorage.setItem(CLAVE, t) : localStorage.removeItem(CLAVE); } catch {} };

const mostrar = (nombre) => {
    const hoja = vistas.nuevo;
    vistas.conectar.hidden = nombre !== "conectar";
    vistas.galeria.hidden = nombre === "conectar";
    if (nombre === "nuevo") {
        hoja.hidden = false;
        hoja.scrollTop = 0;
        requestAnimationFrame(() => requestAnimationFrame(() => hoja.classList.add("abierta")));
    } else if (!hoja.hidden) {
        hoja.classList.remove("abierta");
        setTimeout(() => !hoja.classList.contains("abierta") && (hoja.hidden = true), 450);
    }
};

addEventListener("scroll", () => document.body.classList.toggle("desplazado", scrollY > 40), {passive: true});

const aviso = (texto, {girando = false, error = false, dura = 0} = {}) => {
    const a = $("#aviso");
    clearTimeout(aviso.t);
    if (!texto) { a.hidden = true; return; }
    a.hidden = false;
    a.classList.toggle("aviso--error", error);
    a.querySelector(".aviso__giro").hidden = !girando;
    a.querySelector(".aviso__texto").textContent = texto;
    if (dura) aviso.t = setTimeout(() => (a.hidden = true), dura);
};

async function leerWeb() {
    const html = await (await fetch(WEB, {cache: "no-store"})).text();
    const m = html.match(/window\.TATUAJES = (\[.*?\]);<\/script>/s);
    const datos = m ? JSON.parse(m[1]) : [];
    for (const o of datos) {
        const archivo = o.fotos[0].split("/").pop();
        minisWeb.set(archivo.slice(0, archivo.indexOf(".")), new URL(o.mini || o.fotos[0], WEB).href);
    }
    return datos.map((o) => o.fotos[0].split("/").pop().split(".")[0]);
}

async function miniatura(img, nombre) {
    const r = raiz(nombre);
    if (minisLocales.has(r)) return (img.src = minisLocales.get(r));
    if (minisWeb.has(r)) return (img.src = minisWeb.get(r));
    try {
        const url = URL.createObjectURL(await gh.fotoPrivada(nombre));
        minisLocales.set(r, url);
        img.src = url;
    } catch {}
}

function pintar() {
    lista.textContent = "";
    for (const [i, t] of tatuajes.entries()) {
        const li = document.createElement("li");
        li.className = "foto";
        li.dataset.i = i;
        const img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        miniatura(img, t.fotos[0]);
        li.append(img);
        if (t.fotos.length > 1) {
            const n = document.createElement("span");
            n.className = "foto__cuenta";
            n.textContent = t.fotos.length;
            li.append(n);
        }
        if (ordenando) {
            const quitar = document.createElement("button");
            quitar.type = "button";
            quitar.className = "foto__quitar";
            quitar.setAttribute("aria-label", "Quitar de la web");
            quitar.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>';
            quitar.addEventListener("click", () => {
                if (!confirm("¿Quitar este tatuaje de la web?")) return;
                tatuajes.splice(i, 1);
                cambiado = true;
                pintar();
            });
            li.append(quitar);
        }
        lista.append(li);
    }
    $("#vacio").hidden = tatuajes.length > 0;
    $("#ayudaOrden").hidden = !ordenando;
    lista.classList.toggle("ordenando", ordenando);
    $("#ordenar").textContent = ordenando ? (cambiado ? "Guardar" : "Listo") : "Ordenar";
    $("#agregar").disabled = ordenando;
}

const ordenLista = Sortable.create(lista, {
    disabled: true,
    animation: 180,
    delay: 120,
    delayOnTouchOnly: true,
    filter: ".foto__quitar",
    preventOnFilter: false,
    onEnd: (e) => {
        if (e.oldIndex === e.newIndex) return;
        const [t] = tatuajes.splice(e.oldIndex, 1);
        tatuajes.splice(e.newIndex, 0, t);
        cambiado = true;
        pintar();
    },
});

const firma = (t) => t.fotos.join("|");

async function vigilarWeb(esperado) {
    const yo = ++vigilancia;
    aviso("Publicado. Actualizando la web…", {girando: true});
    const meta = esperado.map((t) => raiz(t.fotos[0])).join(",");
    for (let i = 0; i < 40 && yo === vigilancia; i++) {
        await new Promise((r) => setTimeout(r, i ? 8000 : 15000));
        try {
            if ((await leerWeb()).join(",") === meta) {
                if (yo === vigilancia) aviso("Listo, ya se ve en la web.", {dura: 4000});
                pintar();
                return;
            }
        } catch {}
    }
    if (yo === vigilancia) aviso("Publicado. La web tarda un poco más de lo normal en actualizarse.", {dura: 6000});
}

async function trabajar(fn) {
    if (ocupado) return;
    ocupado = true;
    document.body.classList.add("ocupado");
    try {
        await fn();
    } catch (e) {
        console.error(e);
        aviso(e.message || "Algo salió mal.", {error: true, dura: 6000});
        if (e.status === 401) desconectar();
    } finally {
        ocupado = false;
        document.body.classList.remove("ocupado");
    }
}

async function cargar() {
    aviso("Cargando…", {girando: true});
    await Promise.all([gh.leer().then((t) => (tatuajes = t)), leerWeb().catch(() => {})]);
    aviso("");
    pintar();
}

$("#ordenar").addEventListener("click", () => trabajar(async () => {
    if (!ordenando) {
        ordenando = true;
        cambiado = false;
        vistos = new Set(tatuajes.map(firma));
        ordenLista.option("disabled", false);
        pintar();
        return;
    }
    if (cambiado) {
        const deseado = tatuajes.map(firma);
        const final = await gh.guardar((actual) => {
            const deOtro = actual.filter((t) => !vistos.has(firma(t)));
            const ordenados = deseado.map((f) => actual.find((t) => firma(t) === f)).filter(Boolean);
            const borrados = actual.filter((t) => vistos.has(firma(t)) && !deseado.includes(firma(t)));
            const quedan = [...deOtro, ...ordenados];
            const enUso = new Set(quedan.flatMap((t) => t.fotos));
            return {
                tatuajes: quedan,
                borrar: [...new Set(borrados.flatMap((t) => t.fotos))].filter((f) => !enUso.has(f)),
                mensaje: borrados.length ? "Galería: ordenar y quitar tatuajes" : "Galería: cambiar el orden",
            };
        }, (t) => aviso(t, {girando: true}));
        tatuajes = final;
        vigilarWeb(final);
    }
    ordenando = false;
    cambiado = false;
    ordenLista.option("disabled", true);
    pintar();
}));

function pintarNuevas() {
    fotosNuevas.textContent = "";
    for (const [i, f] of nuevas.entries()) {
        const li = document.createElement("li");
        li.className = "foto";
        const img = document.createElement("img");
        img.src = f.url;
        img.alt = "";
        li.append(img);
        if (i === 0) {
            const tag = document.createElement("span");
            tag.className = "foto__etiqueta";
            tag.textContent = "Miniatura";
            li.append(tag);
        }
        const quitar = document.createElement("button");
        quitar.type = "button";
        quitar.className = "foto__quitar";
        quitar.setAttribute("aria-label", "Quitar foto");
        quitar.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>';
        quitar.addEventListener("click", (e) => {
            e.stopPropagation();
            URL.revokeObjectURL(f.url);
            nuevas.splice(i, 1);
            pintarNuevas();
        });
        li.append(quitar);
        li.addEventListener("click", () => {
            if (i === 0) return;
            nuevas.unshift(...nuevas.splice(i, 1));
            pintarNuevas();
        });
        fotosNuevas.append(li);
    }
    $("#elegir").hidden = nuevas.length > 0;
    $("#seleccion").hidden = nuevas.length === 0;
    $("#publicar").disabled = nuevas.length === 0;
}

Sortable.create(fotosNuevas, {
    animation: 180,
    delay: 120,
    delayOnTouchOnly: true,
    filter: ".foto__quitar",
    preventOnFilter: false,
    onEnd: (e) => {
        if (e.oldIndex === e.newIndex) return;
        const [f] = nuevas.splice(e.oldIndex, 1);
        nuevas.splice(e.newIndex, 0, f);
        pintarNuevas();
    },
});

const cerrarNuevo = () => {
    for (const f of nuevas) URL.revokeObjectURL(f.url);
    nuevas = [];
    pintarNuevas();
    mostrar("galeria");
};

$("#agregar").addEventListener("click", () => {
    if (ocupado) return;
    pintarNuevas();
    mostrar("nuevo");
});
$("#cancelarNuevo").addEventListener("click", () => !ocupado && cerrarNuevo());
$("#elegir").addEventListener("click", () => archivos.click());
$("#masFotos").addEventListener("click", () => archivos.click());

archivos.addEventListener("change", () => trabajar(async () => {
    const elegidos = [...archivos.files];
    archivos.value = "";
    for (const [i, archivo] of elegidos.entries()) {
        aviso(`Preparando foto ${i + 1} de ${elegidos.length}…`, {girando: true});
        const blob = await preparar(archivo);
        nuevas.push({blob, url: URL.createObjectURL(blob)});
    }
    aviso("");
    pintarNuevas();
}));

$("#publicar").addEventListener("click", () => trabajar(async () => {
    if (!nuevas.length) return;
    const fotos = nuevas.map((f, i) => ({...f, nombre: nombreNuevo(i)}));
    const tatuaje = {alt: ALT, fotos: fotos.map((f) => f.nombre)};
    const final = await gh.guardar((actual) => ({
        tatuajes: [tatuaje, ...actual],
        nuevas: fotos,
        mensaje: `Galería: nuevo tatuaje (${fotos.length} ${fotos.length > 1 ? "fotos" : "foto"})`,
    }), (t) => aviso(t, {girando: true}));
    minisLocales.set(raiz(fotos[0].nombre), fotos[0].url);
    for (const f of fotos.slice(1)) URL.revokeObjectURL(f.url);
    nuevas = [];
    tatuajes = final;
    mostrar("galeria");
    pintar();
    vigilarWeb(final);
}));

function desconectar() {
    guardarToken("");
    gh.usarToken("");
    tatuajes = [];
    mostrar("conectar");
}

$("#desconectar").addEventListener("click", () => {
    if (confirm("¿Quitar el token de este teléfono?")) desconectar();
});

$("#crearToken").href = "https://github.com/settings/personal-access-tokens/new?" + new URLSearchParams({
    name: "Bonfire Tattoos app",
    description: "Publicar tatuajes en la web desde la app",
    target_name: "ATR-WEBS",
    expires_in: "none",
    contents: "write",
});

$("#formToken").addEventListener("submit", (e) => {
    e.preventDefault();
    trabajar(async () => {
        const t = $("#token").value.trim();
        gh.usarToken(t);
        aviso("Comprobando…", {girando: true});
        await gh.comprobar();
        guardarToken(t);
        $("#token").value = "";
        mostrar("galeria");
        await cargar();
    });
});

const guardado = leerToken();
if (guardado) {
    gh.usarToken(guardado);
    mostrar("galeria");
    trabajar(cargar);
} else {
    mostrar("conectar");
}
