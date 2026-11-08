/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { beforeEach, describe, expect, it } from 'vitest'

import {
  getAffiliateCode,
  getDistributorCode,
  saveAffiliateCode,
  saveDistributorCode,
} from '../storage'

describe('invite code storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps whichever link the visitor clicked last (R2)', () => {
    saveDistributorCode('Dabc123')
    expect(getDistributorCode()).toBe('Dabc123')

    // 后点推广链接：分销码被清掉
    saveAffiliateCode('AFF1')
    expect(getAffiliateCode()).toBe('AFF1')
    expect(getDistributorCode()).toBe('')

    // 再后点分销链接：推广码被清掉
    saveDistributorCode('Dxyz999')
    expect(getDistributorCode()).toBe('Dxyz999')
    expect(getAffiliateCode()).toBe('')
  })
})
