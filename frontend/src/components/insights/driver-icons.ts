import { Activity, HeartPulse, Moon, SunMedium } from 'lucide-react'

import type { DriverIconName } from '@/utils/driver-ranking'

export const DRIVER_ICON_MAP: Record<DriverIconName, typeof Moon> = {
  moon: Moon,
  'heart-pulse': HeartPulse,
  activity: Activity,
  'sun-medium': SunMedium,
}
