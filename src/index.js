/* @flow */

import he from 'he';
import axios from 'axios';
import { find } from 'lodash';
import striptags from 'striptags';

const fetchData =
  typeof fetch === 'function'
    ? async function fetchData(url) {
      const response = await fetch(url);
      return await response.text();
    }
    : async function fetchData(url) {
      const { data } = await axios.get(url);
      return data;
    };

export async function getSubtitles({ videoID, lang = 'en' }) {
  const data = await fetchData(
    `https://youtube.com/watch?v=${videoID}`
  );
  console.log('Contains ytInitialPlayerResponse:', data.includes('ytInitialPlayerResponse'));

  // * ensure we have access to captions data
  if (!data.includes('captionTracks'))
    throw new Error(`Could not find captions for video: ${videoID}`);

  const ytMatch = data.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
  console.log('ytMatch:', ytMatch ? '✅ Match found' : '❌ No match');
  if (!ytMatch) throw new Error(`Could not extract ytInitialPlayerResponse`);

  const playerResponse = JSON.parse(ytMatch[1]);
  const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captionTracks || !captionTracks.length) {
    throw new Error(`Could not find captions for video: ${videoID}`);
  }

  const subtitle =
    find(captionTracks, {
      vssId: `.${lang}`,
    }) ||
    find(captionTracks, {
      vssId: `a.${lang}`,
    }) ||
    find(captionTracks, ({ vssId }) => vssId && vssId.match(`.${lang}`));

  // * ensure we have found the correct subtitle lang
  if (!subtitle || (subtitle && !subtitle.baseUrl))
    throw new Error(`Could not find ${lang} captions for ${videoID}`);

  const transcript = await fetchData(subtitle.baseUrl);
  const lines = transcript
    .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', '')
    .replace('</transcript>', '')
    .split('</text>')
    .filter(line => line && line.trim())
    .map(line => {
      const startRegex = /start="([\d.]+)"/;
      const durRegex = /dur="([\d.]+)"/;

      const [, start] = startRegex.exec(line);
      const [, dur] = durRegex.exec(line);

      const htmlText = line
        .replace(/<text.+>/, '')
        .replace(/&amp;/gi, '&')
        .replace(/<\/?[^>]+(>|$)/g, '');

      const decodedText = he.decode(htmlText);
      const text = striptags(decodedText);

      return {
        start,
        dur,
        text,
      };
    });

  return lines;
}
