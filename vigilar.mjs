// Revisa que Fonazo responda y avisa por WhatsApp SOLO cuando se cae y cuando vuelve.
// Lo ejecuta GitHub Actions cada 5 minutos (.github/workflows/vigilar.yml).
import fs from 'node:fs';

const URL_SALUD = `${(process.env.FONAZO_URL || 'https://fonazo-inventario.seenode.app').replace(/\/$/, '')}/api/salud`;
const ARCHIVO = 'estado.json';
const INTENTOS = 3; // antes de dar por caído: 3 intentos en ~40 s (evita falsas alarmas)
const ESPERA_MS = 20000;

const hora = (t) => {
    const d = new Date(t);
    const h = d.toLocaleTimeString('en-US', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    const f = d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit' });
    return `${h} del ${f}`;
};
const duracion = (ms) => {
    const min = Math.round(ms / 60000);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

async function revisar() {
    let ultimoError = '';
    for (let i = 1; i <= INTENTOS; i++) {
        try {
            const r = await fetch(URL_SALUD, { signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } });
            const cuerpo = await r.json().catch(() => ({}));
            if (r.ok && cuerpo.ok) return { arriba: true, mantenimiento: !!cuerpo.mantenimiento };
            ultimoError = `respondió HTTP ${r.status}`;
        } catch (err) {
            ultimoError = err.name === 'TimeoutError' ? 'no respondió en 15 s' : `sin conexión (${err.cause?.code || err.message})`;
        }
        console.log(`Intento ${i}/${INTENTOS}: ${ultimoError}`);
        if (i < INTENTOS) await new Promise((r) => setTimeout(r, ESPERA_MS));
    }
    return { arriba: false, error: ultimoError };
}

async function whatsapp(texto) {
    const tel = String(process.env.WHATSAPP_TELEFONO || '').replace(/\D/g, '');
    const key = String(process.env.WHATSAPP_APIKEY || '').trim();
    if (!tel || !key) {
        console.log('::warning::Faltan los secretos WHATSAPP_TELEFONO / WHATSAPP_APIKEY. Mensaje no enviado:\n' + texto);
        return false;
    }
    for (let i = 1; i <= 3; i++) {
        try {
            const r = await fetch(`https://api.callmebot.com/whatsapp.php?phone=%2B${tel}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(20000) });
            const t = await r.text();
            if (r.ok && !/error|invalid|not active/i.test(t.slice(0, 500))) return true;
            console.log(`CallMeBot intento ${i}: HTTP ${r.status}`);
        } catch (err) {
            console.log(`CallMeBot intento ${i}: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 5000 * i));
    }
    console.log('::error::No se pudo enviar el WhatsApp');
    return false;
}

const leer = () => {
    try {
        return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    } catch {
        return { estado: 'arriba', desde: Date.now() };
    }
};

const ahora = Date.now();
const antes = leer();
const prueba = process.env.PRUEBA === 'si';
const r = prueba ? { arriba: false, error: 'PRUEBA (simulada, la página está bien)' } : await revisar();
const estado = r.arriba ? 'arriba' : 'caido';
console.log(`Fonazo: ${estado}${r.mantenimiento ? ' (en horario de cierre / mantenimiento)' : ''}`);

let nuevo = { ...antes };
if (prueba) {
    await whatsapp(`🔴 *PRUEBA de alerta de caída*\nAsí te llegará el aviso si Fonazo se cae.\nMotivo: ${r.error}.\n${hora(ahora)}`);
} else if (estado !== antes.estado) {
    if (estado === 'caido') {
        const enviado = await whatsapp(`🔴 *Fonazo CAÍDO*\nLa página no responde desde las ${hora(ahora)} (${r.error}).\nTe aviso cuando vuelva.\n${URL_SALUD.replace('/api/salud', '')}`);
        nuevo = { ...antes, estado, desde: ahora, aviso_enviado: enviado };
    } else {
        await whatsapp(`🟢 *Fonazo RECUPERADO* (${hora(ahora)})\nEstuvo caído ${duracion(ahora - (antes.desde || ahora))}.`);
        nuevo = { latido: antes.latido, estado, desde: ahora };
    }
} else if (estado === 'caido' && antes.aviso_enviado === false) {
    // Si el primer aviso no salió, se vuelve a intentar
    nuevo.aviso_enviado = await whatsapp(`🔴 *Fonazo CAÍDO*\nNo responde desde las ${hora(antes.desde)} (${r.error}).`);
}
// GitHub apaga los horarios de repos sin actividad en 60 días: un "latido" mensual lo mantiene vivo
if (!antes.latido || ahora - antes.latido > 30 * 24 * 3600 * 1000) nuevo.latido = ahora;
fs.writeFileSync(ARCHIVO, JSON.stringify(nuevo, null, 2) + '\n');
