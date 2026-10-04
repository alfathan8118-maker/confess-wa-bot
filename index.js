import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@whiskeysockets/baileys'
import P from 'pino'
import qrcode from 'qrcode-terminal'
import readline from 'node:readline'

const PREFIX = '.'
const CONFESS_COMMAND = `${PREFIX}confess`

function normalizeNumber(number) {
  return number.replace(/\D/g, '')
}

function jidFromNumber(number) {
  return `${normalizeNumber(number)}@s.whatsapp.net`
}

function helpText() {
  return [
    '💌 *CONFESS BOT*',
    '',
    `Kirim confess dengan format:`,
    `*${CONFESS_COMMAND} 628xxxxxxxxxx isi confess*`,
    '',
    'Contoh:',
    `${CONFESS_COMMAND} 6281234567890 Hai, aku sebenarnya suka sama kamu.`,
    '',
    '🔒 Nomor pengirim tidak diteruskan ke penerima.',
    '📨 Penerima akan melihat pesan berasal dari nomor bot.'
  ].join('\n')
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Confess Bot', 'Chrome', '1.0.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Scan QR ini dari WhatsApp > Perangkat tertaut:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('\n✅ CONFESS BOT TERHUBUNG!')
      console.log('Ketik .help untuk melihat cara penggunaan.\n')
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut

      console.log(`\n❌ Koneksi terputus. Reconnect: ${shouldReconnect}`)

      if (shouldReconnect) {
        setTimeout(startBot, 3000)
      } else {
        console.log('🔴 Sesi logout. Hapus folder auth_info lalu jalankan lagi.')
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages?.[0]
    if (!msg?.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    if (!from || from.endsWith('@g.us')) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ''

    const input = text.trim()

    if (input === '.help' || input === '.menu') {
      await sock.sendMessage(from, { text: helpText() })
      return
    }

    if (!input.toLowerCase().startsWith(CONFESS_COMMAND)) return

    const rest = input.slice(CONFESS_COMMAND.length).trim()
    const firstSpace = rest.indexOf(' ')

    if (firstSpace === -1) {
      await sock.sendMessage(from, {
        text: `❌ Format salah.\n\n${CONFESS_COMMAND} 628xxxxxxxxxx isi confess`
      })
      return
    }

    const targetNumber = normalizeNumber(rest.slice(0, firstSpace))
    const confess = rest.slice(firstSpace + 1).trim()

    if (!/^\d{8,15}$/.test(targetNumber)) {
      await sock.sendMessage(from, {
        text: '❌ Nomor tujuan tidak valid. Gunakan format 628xxxxxxxxxx.'
      })
      return
    }

    if (!confess) {
      await sock.sendMessage(from, {
        text: '❌ Isi confess masih kosong.'
      })
      return
    }

    if (confess.length > 1000) {
      await sock.sendMessage(from, {
        text: '❌ Confess maksimal 1000 karakter.'
      })
      return
    }

    const target = jidFromNumber(targetNumber)

    const anonymousMessage = [
      '💌 *ANONYMOUS CONFESS*',
      '',
      confess,
      '',
      '— Confess dikirim secara anonim melalui bot.'
    ].join('\n')

    try {
      await sock.sendMessage(target, { text: anonymousMessage })

      await sock.sendMessage(from, {
        text: '✅ Confess berhasil dikirim secara anonim.'
      })

      console.log(`Confess terkirim ke ${targetNumber} (pengirim disembunyikan dari penerima).`)
    } catch (err) {
      console.error(err)
      await sock.sendMessage(from, {
        text: '❌ Gagal mengirim. Pastikan nomor tujuan terdaftar di WhatsApp.'
      })
    }
  })
}

startBot().catch(err => {
  console.error('Fatal error:', err)
})
