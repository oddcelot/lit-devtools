/**
 * The session the figures show: timeline-recording.json, recorded in the
 * playground (counter, list and route clicks) and read off `timeline-view`
 * after recording, in the shapes the panel's views take.
 */
import {toSpans} from '../../lib/timeline/derive.js';
import type {LayerState} from '../timeline-layers.js';
import type {TimelineEvent} from '../../types/timeline.js';
import recording from './timeline-recording.json';

export const events = recording.events as TimelineEvent[];
export const layers = recording.layers as LayerState[];
export const spans = toSpans(events);
/** What `timeline-view` draws a lane for: captured layers that make events. */
export const visibleTracks = layers
  .filter((l) => l.enabled && l.id !== 'lit-changed-values')
  .map((l) => l.id);
