import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export interface PushPayload {
  title: string
  body: string
  tag?: string
  url?: string
}

export async function sendPush(subscription: webpush.PushSubscription, payload: PushPayload): Promise<void> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
  } catch {
    // Subscription expired or invalid — caller should clean it up
  }
}
