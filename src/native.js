import { App } from '@capacitor/app';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
if (Capacitor.isNativePlatform()) window.NativeBridge = { App, Filesystem, Share, StatusBar };
