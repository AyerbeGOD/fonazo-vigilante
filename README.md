# Vigilante de Fonazo

- **Vigilar Fonazo (cada 5 min):** revisa `https://fonazo-inventario.seenode.app/api/salud`. Si falla 3 veces seguidas (~40 s), envía **un** aviso de caída por Telegram; cuando vuelve, envía **uno** de recuperado. Nada más.
- **Modo mantenimiento:** Actions → *Modo mantenimiento* → *Run workflow* → elegir `activar`, `desactivar`, `automatico`, `estado` o `prueba-whatsapp`.

Los avisos de cierre (10 pm) y apertura (8 am) los envía el propio servidor de Fonazo.

Secretos (Settings → Secrets and variables → Actions): `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `BOT_TOKEN`.
Este repositorio es público para que GitHub Actions sea gratis; no contiene datos ni claves (las claves están en los secretos).
