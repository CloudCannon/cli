#!/usr/bin/env node

import tab from '@bomb.sh/tab/citty';
import { runMain } from 'citty';
import { main } from './main.ts';

await tab(main);
runMain(main);
