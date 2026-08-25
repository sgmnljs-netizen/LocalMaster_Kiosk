/**
 * [키오스크 VAN 단말기 어댑터 팩토리 (VanAdapterFactory)]
 */

import type { IVanTerminalAdapter, VanConfig, VanProviderType } from '../van_types';
import { MockVanAdapter } from './MockVanAdapter';
import { KcpVcatAdapter } from './KcpVcatAdapter';
import { NiceVanAdapter } from './NiceVanAdapter';
import { SmartroVanAdapter } from './SmartroVanAdapter';
import { DEFAULT_VAN_CONFIG } from './BaseVanAdapter';

export class VanAdapterFactory {
  private static instances: Map<string, IVanTerminalAdapter> = new Map();

  public static getAdapter(config?: Partial<VanConfig>): IVanTerminalAdapter {
    const mergedConfig = { ...DEFAULT_VAN_CONFIG, ...config };
    let rawProvider = (mergedConfig.provider || 'KCP').toUpperCase();
    if (rawProvider.endsWith('_VAN')) {
      rawProvider = rawProvider.replace('_VAN', '');
    }
    const provider = rawProvider as VanProviderType;
    const isMock = mergedConfig.isMock;

    if (isMock || provider === 'MOCK') {
      if (!this.instances.has('MOCK')) {
        this.instances.set('MOCK', new MockVanAdapter(mergedConfig));
      }
      const adapter = this.instances.get('MOCK')!;
      adapter.setConfig(mergedConfig);
      return adapter;
    }

    const instanceKey = `${provider}_${mergedConfig.terminalId || 'DEFAULT'}`;
    if (!this.instances.has(instanceKey)) {
      let newAdapter: IVanTerminalAdapter;
      switch (provider) {
        case 'KCP':
        case 'KOCES':
          newAdapter = new KcpVcatAdapter(mergedConfig);
          break;
        case 'NICE':
          newAdapter = new NiceVanAdapter(mergedConfig);
          break;
        case 'SMARTRO':
          newAdapter = new SmartroVanAdapter(mergedConfig);
          break;
        default:
          console.warn(`[Kiosk VanAdapterFactory] 알 수 없는 VAN Provider: ${provider}, KCP 어댑터로 폴백합니다.`);
          newAdapter = new KcpVcatAdapter(mergedConfig);
          break;
      }
      this.instances.set(instanceKey, newAdapter);
    }

    const adapter = this.instances.get(instanceKey)!;
    adapter.setConfig(mergedConfig);
    return adapter;
  }

  public static clearInstances(): void {
    this.instances.clear();
  }
}
