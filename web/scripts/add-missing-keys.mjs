import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`
}

const newKeys = {
  en: {
    'Account API access is restricted': 'Account API access is restricted',
    'Account disabled': 'Account disabled',
    'API access is disabled for this account. You can view the risk events or submit an appeal.':
      'API access is disabled for this account. You can view the risk events or submit an appeal.',
    'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.':
      'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.',
    'Appeal accepted': 'Appeal accepted',
    'Appeal in progress': 'Appeal in progress',
    'Appeal rejected': 'Appeal rejected',
    'Appeal status': 'Appeal status',
    'Content inspection': 'Content inspection',
    Disposition: 'Disposition',
    'Expected release at {{time}}': 'Expected release at {{time}}',
    'Failed to confirm the user agreement':
      'Failed to confirm the user agreement',
    'Failed to confirm the user agreement. Check your connection and try again.':
      'Failed to confirm the user agreement. Check your connection and try again.',
    'Failed to load the user agreement': 'Failed to load the user agreement',
    Level: 'Level',
    'Log out': 'Log out',
    'Not appealed': 'Not appealed',
    'Please review and accept the updated user agreement to continue using the console.':
      'Please review and accept the updated user agreement to continue using the console.',
    'Reason: {{category}}': 'Reason: {{category}}',
    Recorded: 'Recorded',
    'Request content did not pass content inspection and this request was stopped':
      'Request content did not pass content inspection and this request was stopped',
    Restricted: 'Restricted',
    'Restricted for {{duration}}': 'Restricted for {{duration}}',
    'Restriction lifts in about {{count}} minutes':
      'Restriction lifts in about {{count}} minutes',
    'User agreement updated': 'User agreement updated',
    'Your appeal is already being processed.':
      'Your appeal is already being processed.',
    '{{count}} days': '{{count}} days',
    '{{count}} hours': '{{count}} hours',
    '{{count}} minutes': '{{count}} minutes',
  },
  zh: {
    'Account API access is restricted': '账号 API 访问已受限',
    'Account disabled': '账号已停用',
    'API access is disabled for this account. You can view the risk events or submit an appeal.':
      '该账号的 API 访问已停用。您可以查看风险事件或提交申诉。',
    'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.':
      '该账号的 API 访问已临时受限。您可以查看风险事件或提交申诉。',
    'Appeal accepted': '申诉已通过',
    'Appeal in progress': '申诉处理中',
    'Appeal rejected': '申诉已驳回',
    'Appeal status': '申诉状态',
    'Content inspection': '内容检查',
    Disposition: '处置',
    'Expected release at {{time}}': '预计解除时间：{{time}}',
    'Failed to confirm the user agreement': '确认用户协议失败',
    'Failed to confirm the user agreement. Check your connection and try again.':
      '确认用户协议失败。请检查网络连接后重试。',
    'Failed to load the user agreement': '用户协议加载失败',
    Level: '级别',
    'Log out': '退出登录',
    'Not appealed': '未申诉',
    'Please review and accept the updated user agreement to continue using the console.':
      '请查阅并接受更新后的用户协议，以继续使用控制台。',
    'Reason: {{category}}': '原因：{{category}}',
    Recorded: '已记录',
    'Request content did not pass content inspection and this request was stopped':
      '请求内容未通过内容检查，本次请求已被拦截',
    Restricted: '已限制',
    'Restricted for {{duration}}': '已限制 {{duration}}',
    'Restriction lifts in about {{count}} minutes':
      '约 {{count}} 分钟后解除限制',
    'User agreement updated': '用户协议已更新',
    'Your appeal is already being processed.': '您的申诉已在处理中。',
    '{{count}} days': '{{count}} 天',
    '{{count}} hours': '{{count}} 小时',
    '{{count}} minutes': '{{count}} 分钟',
  },
  'zh-TW': {
    'Account API access is restricted': '帳號 API 存取已受限',
    'Account disabled': '帳號已停用',
    'API access is disabled for this account. You can view the risk events or submit an appeal.':
      '該帳號的 API 存取已停用。您可以查看風險事件或提交申訴。',
    'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.':
      '該帳號的 API 存取已暫時受限。您可以查看風險事件或提交申訴。',
    'Appeal accepted': '申訴已通過',
    'Appeal in progress': '申訴處理中',
    'Appeal rejected': '申訴已駁回',
    'Appeal status': '申訴狀態',
    'Content inspection': '內容檢查',
    Disposition: '處置',
    'Expected release at {{time}}': '預計解除時間：{{time}}',
    'Failed to confirm the user agreement': '確認使用者協議失敗',
    'Failed to confirm the user agreement. Check your connection and try again.':
      '確認使用者協議失敗。請檢查網路連線後重試。',
    'Failed to load the user agreement': '使用者協議載入失敗',
    Level: '級別',
    'Log out': '登出',
    'Not appealed': '未申訴',
    'Please review and accept the updated user agreement to continue using the console.':
      '請查閱並接受更新後的使用者協議，以繼續使用控制台。',
    'Reason: {{category}}': '原因：{{category}}',
    Recorded: '已記錄',
    'Request content did not pass content inspection and this request was stopped':
      '請求內容未通過內容檢查，本次請求已被攔截',
    Restricted: '已限制',
    'Restricted for {{duration}}': '已限制 {{duration}}',
    'Restriction lifts in about {{count}} minutes':
      '約 {{count}} 分鐘後解除限制',
    'User agreement updated': '使用者協議已更新',
    'Your appeal is already being processed.': '您的申訴已在處理中。',
    '{{count}} days': '{{count}} 天',
    '{{count}} hours': '{{count}} 小時',
    '{{count}} minutes': '{{count}} 分鐘',
  },
  fr: {
    'Account API access is restricted': "L'accès API du compte est restreint",
    'Account disabled': 'Compte désactivé',
    'API access is disabled for this account. You can view the risk events or submit an appeal.':
      "L'accès API de ce compte est désactivé. Vous pouvez consulter les événements de risque ou soumettre un appel.",
    'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.':
      "L'accès API de ce compte est temporairement restreint. Vous pouvez consulter les événements de risque ou soumettre un appel.",
    'Appeal accepted': 'Appel accepté',
    'Appeal in progress': 'Appel en cours',
    'Appeal rejected': 'Appel rejeté',
    'Appeal status': "Statut de l'appel",
    'Content inspection': 'Inspection du contenu',
    Disposition: 'Mesure',
    'Expected release at {{time}}': 'Levée prévue à {{time}}',
    'Failed to confirm the user agreement':
      "Échec de la confirmation du contrat d'utilisation",
    'Failed to confirm the user agreement. Check your connection and try again.':
      "Échec de la confirmation du contrat d'utilisation. Vérifiez votre connexion et réessayez.",
    'Failed to load the user agreement':
      "Échec du chargement du contrat d'utilisation",
    Level: 'Niveau',
    'Log out': 'Se déconnecter',
    'Not appealed': 'Aucun appel',
    'Please review and accept the updated user agreement to continue using the console.':
      "Veuillez consulter et accepter le contrat d'utilisation mis à jour pour continuer à utiliser la console.",
    'Reason: {{category}}': 'Raison : {{category}}',
    Recorded: 'Enregistré',
    'Request content did not pass content inspection and this request was stopped':
      "Le contenu de la requête n'a pas passé l'inspection et la requête a été arrêtée",
    Restricted: 'Restreint',
    'Restricted for {{duration}}': 'Restreint pendant {{duration}}',
    'Restriction lifts in about {{count}} minutes':
      'Fin de la restriction dans environ {{count}} minutes',
    'User agreement updated': "Contrat d'utilisation mis à jour",
    'Your appeal is already being processed.':
      'Votre appel est déjà en cours de traitement.',
    '{{count}} days': '{{count}} jours',
    '{{count}} hours': '{{count}} heures',
    '{{count}} minutes': '{{count}} minutes',
  },
  ja: {
    'Account API access is restricted':
      'アカウントの API アクセスが制限されています',
    'Account disabled': 'アカウントが無効化されています',
    'API access is disabled for this account. You can view the risk events or submit an appeal.':
      'このアカウントの API アクセスは無効化されています。リスクイベントの確認または異議申し立てができます。',
    'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.':
      'このアカウントの API アクセスは一時的に制限されています。リスクイベントの確認または異議申し立てができます。',
    'Appeal accepted': '異議申し立てが承認されました',
    'Appeal in progress': '異議申し立て処理中',
    'Appeal rejected': '異議申し立てが却下されました',
    'Appeal status': '異議申し立て状態',
    'Content inspection': 'コンテンツ検査',
    Disposition: '措置',
    'Expected release at {{time}}': '解除予定時刻：{{time}}',
    'Failed to confirm the user agreement': '利用規約の確認に失敗しました',
    'Failed to confirm the user agreement. Check your connection and try again.':
      '利用規約の確認に失敗しました。接続を確認して再試行してください。',
    'Failed to load the user agreement': '利用規約の読み込みに失敗しました',
    Level: 'レベル',
    'Log out': 'ログアウト',
    'Not appealed': '異議申し立てなし',
    'Please review and accept the updated user agreement to continue using the console.':
      'コンソールを引き続き利用するには、更新された利用規約を確認し同意してください。',
    'Reason: {{category}}': '理由：{{category}}',
    Recorded: '記録済み',
    'Request content did not pass content inspection and this request was stopped':
      'リクエスト内容がコンテンツ検査を通過せず、このリクエストは停止されました',
    Restricted: '制限中',
    'Restricted for {{duration}}': '{{duration}} 制限中',
    'Restriction lifts in about {{count}} minutes':
      '制限解除まで約 {{count}} 分',
    'User agreement updated': '利用規約が更新されました',
    'Your appeal is already being processed.':
      '異議申し立てはすでに処理中です。',
    '{{count}} days': '{{count}} 日',
    '{{count}} hours': '{{count}} 時間',
    '{{count}} minutes': '{{count}} 分',
  },
  ru: {
    'Account API access is restricted': 'Доступ к API аккаунта ограничен',
    'Account disabled': 'Аккаунт отключён',
    'API access is disabled for this account. You can view the risk events or submit an appeal.':
      'Доступ к API этого аккаунта отключён. Вы можете просмотреть события риска или подать апелляцию.',
    'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.':
      'Доступ к API этого аккаунта временно ограничен. Вы можете просмотреть события риска или подать апелляцию.',
    'Appeal accepted': 'Апелляция принята',
    'Appeal in progress': 'Апелляция рассматривается',
    'Appeal rejected': 'Апелляция отклонена',
    'Appeal status': 'Статус апелляции',
    'Content inspection': 'Проверка содержимого',
    Disposition: 'Мера',
    'Expected release at {{time}}': 'Ожидаемое снятие: {{time}}',
    'Failed to confirm the user agreement':
      'Не удалось подтвердить пользовательское соглашение',
    'Failed to confirm the user agreement. Check your connection and try again.':
      'Не удалось подтвердить пользовательское соглашение. Проверьте подключение и повторите попытку.',
    'Failed to load the user agreement':
      'Не удалось загрузить пользовательское соглашение',
    Level: 'Уровень',
    'Log out': 'Выйти',
    'Not appealed': 'Апелляция не подавалась',
    'Please review and accept the updated user agreement to continue using the console.':
      'Ознакомьтесь с обновлённым пользовательским соглашением и примите его, чтобы продолжить работу с консолью.',
    'Reason: {{category}}': 'Причина: {{category}}',
    Recorded: 'Записано',
    'Request content did not pass content inspection and this request was stopped':
      'Содержимое запроса не прошло проверку, запрос остановлен',
    Restricted: 'Ограничено',
    'Restricted for {{duration}}': 'Ограничено на {{duration}}',
    'Restriction lifts in about {{count}} minutes':
      'Ограничение будет снято примерно через {{count}} мин',
    'User agreement updated': 'Пользовательское соглашение обновлено',
    'Your appeal is already being processed.':
      'Ваша апелляция уже обрабатывается.',
    '{{count}} days': '{{count}} дн.',
    '{{count}} hours': '{{count}} ч',
    '{{count}} minutes': '{{count}} мин',
  },
  vi: {
    'Account API access is restricted':
      'Quyền truy cập API của tài khoản bị hạn chế',
    'Account disabled': 'Tài khoản đã bị vô hiệu hoá',
    'API access is disabled for this account. You can view the risk events or submit an appeal.':
      'Quyền truy cập API của tài khoản này đã bị vô hiệu hoá. Bạn có thể xem các sự kiện rủi ro hoặc gửi khiếu nại.',
    'API access is temporarily restricted for this account. You can view the risk events or submit an appeal.':
      'Quyền truy cập API của tài khoản này tạm thời bị hạn chế. Bạn có thể xem các sự kiện rủi ro hoặc gửi khiếu nại.',
    'Appeal accepted': 'Khiếu nại được chấp nhận',
    'Appeal in progress': 'Đang xử lý khiếu nại',
    'Appeal rejected': 'Khiếu nại bị từ chối',
    'Appeal status': 'Trạng thái khiếu nại',
    'Content inspection': 'Kiểm tra nội dung',
    Disposition: 'Xử lý',
    'Expected release at {{time}}': 'Dự kiến gỡ lúc {{time}}',
    'Failed to confirm the user agreement':
      'Không thể xác nhận thoả thuận người dùng',
    'Failed to confirm the user agreement. Check your connection and try again.':
      'Không thể xác nhận thoả thuận người dùng. Kiểm tra kết nối và thử lại.',
    'Failed to load the user agreement': 'Không thể tải thoả thuận người dùng',
    Level: 'Cấp',
    'Log out': 'Đăng xuất',
    'Not appealed': 'Chưa khiếu nại',
    'Please review and accept the updated user agreement to continue using the console.':
      'Vui lòng xem và chấp nhận thoả thuận người dùng đã cập nhật để tiếp tục sử dụng bảng điều khiển.',
    'Reason: {{category}}': 'Lý do: {{category}}',
    Recorded: 'Đã ghi lại',
    'Request content did not pass content inspection and this request was stopped':
      'Nội dung yêu cầu không vượt qua kiểm tra nội dung, yêu cầu đã bị dừng',
    Restricted: 'Bị hạn chế',
    'Restricted for {{duration}}': 'Bị hạn chế trong {{duration}}',
    'Restriction lifts in about {{count}} minutes':
      'Hạn chế sẽ được gỡ sau khoảng {{count}} phút',
    'User agreement updated': 'Thoả thuận người dùng đã cập nhật',
    'Your appeal is already being processed.':
      'Khiếu nại của bạn đang được xử lý.',
    '{{count}} days': '{{count}} ngày',
    '{{count}} hours': '{{count}} giờ',
    '{{count}} minutes': '{{count}} phút',
  },
}

async function main() {
  let totalAdded = 0

  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))

    let count = 0
    for (const [key, value] of Object.entries(trans)) {
      if (!Object.hasOwn(json.translation, key)) {
        json.translation[key] = value
        count++
      } else if (json.translation[key] !== value) {
        json.translation[key] = value
        count++
      }
    }

    if (count > 0) {
      json.translation = Object.fromEntries(
        Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b))
      )
      await fs.writeFile(filePath, stableStringify(json), 'utf8')
    }

    console.log(`${locale}: ${count} translations applied`)
    totalAdded += count
  }

  console.log(`\nTotal: ${totalAdded} translations applied`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
