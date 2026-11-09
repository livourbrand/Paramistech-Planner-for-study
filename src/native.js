import { App } from '@capacitor/app';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor, registerPlugin } from '@capacitor/core';
const Billing = registerPlugin('BazaarBilling');
if (Capacitor.isNativePlatform()) window.NativeBridge = { App, Filesystem, Share, StatusBar, Billing };
