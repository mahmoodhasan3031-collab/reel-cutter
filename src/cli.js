#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const { getVideoMetadata } = require('./engine/probe');
const { cutClip, splitIntoReels } = require('./engine/cutter');
const { generateOutputFilename } = require('./engine/formatter');

const program = new Command();

program
  .name('reel-cutter')
  .description('Fast, automated video cutter & 9:16 vertical reel maker powered by FFmpeg')
  .version('1.0.0');

/**
 * Helper to display progress percentage in console
 */
function renderProgress(label, percent) {
  const barLength = 25;
  const completed = Math.round((percent / 100) * barLength);
  const bar = '█'.repeat(completed) + '░'.repeat(barLength - completed);
  process.stdout.write(`\r${label} [${bar}] ${percent}%`);
  if (percent >= 100) {
    process.stdout.write('\n');
  }
}

// Command: info / probe
program
  .command('info <file>')
  .alias('probe')
  .description('Inspect video metadata, dimensions, fps, duration, and codecs')
  .action(async (file) => {
    try {
      const filePath = path.resolve(file);
      console.log(`\n🔍 Inspecting: ${filePath}`);
      const meta = await getVideoMetadata(filePath);

      console.log('\n--- Video Information ---');
      console.log(`📁 File:        ${path.basename(meta.path)}`);
      console.log(`⏱️  Duration:    ${meta.durationFormatted} (${meta.duration.toFixed(2)}s)`);
      console.log(`💾 Size:        ${meta.sizeFormatted}`);
      console.log(`📊 Bitrate:     ${meta.bitrate}`);

      console.log('\n--- Video Stream ---');
      console.log(`🎬 Codec:       ${meta.video.codec}`);
      console.log(`📐 Resolution:  ${meta.video.width}x${meta.video.height} (${meta.video.aspectRatio})`);
      console.log(`📱 Orientation: ${meta.video.isVertical ? 'Vertical (Portrait)' : 'Horizontal (Landscape)'}`);
      console.log(`⚡ Framerate:   ${meta.video.fps} fps`);
      console.log(`🎨 Pixel Fmt:   ${meta.video.pixelFormat}`);

      if (meta.audio) {
        console.log('\n--- Audio Stream ---');
        console.log(`🔊 Codec:       ${meta.audio.codec}`);
        console.log(`📻 Channels:    ${meta.audio.channels}`);
        console.log(`🎵 Sample Rate: ${meta.audio.sampleRate}`);
      } else {
        console.log('\n--- Audio Stream ---');
        console.log('🔇 No audio stream found.');
      }
      console.log('');
    } catch (err) {
      console.error(`\n❌ Error probing file: ${err.message}\n`);
      process.exit(1);
    }
  });

// Command: cut
program
  .command('cut')
  .description('Cut a segment from a video with optional 9:16 vertical formatting')
  .requiredOption('-i, --input <path>', 'Input video file')
  .option('-o, --output <path>', 'Output video file')
  .option('-s, --start <time>', 'Start time in seconds or HH:MM:SS', '0')
  .option('-d, --duration <time>', 'Duration to cut in seconds or HH:MM:SS')
  .option('-e, --end <time>', 'End time in seconds or HH:MM:SS')
  .option('--reel', 'Convert segment to 9:16 vertical format (Reels/Shorts/TikTok)', false)
  .option('-m, --mode <mode>', 'Reel mode: "blur" (blurred background), "crop", or "pad"', 'blur')
  .action(async (options) => {
    try {
      const inputPath = path.resolve(options.input);
      const outputPath = options.output
        ? path.resolve(options.output)
        : generateOutputFilename(inputPath, { suffix: options.reel ? 'reel' : 'clip' });

      console.log(`\n✂️  Cutting clip from: ${path.basename(inputPath)}`);
      console.log(`⏱️  Start: ${options.start} | Duration: ${options.duration || options.end || 'Full remainder'}`);
      if (options.reel) {
        console.log(`📱 9:16 Vertical Reel Mode: ${options.mode}`);
      }
      console.log(`🎯 Output target: ${outputPath}\n`);

      let lastPercent = -1;
      const result = await cutClip(inputPath, outputPath, {
        start: options.start,
        duration: options.duration,
        end: options.end,
        reel: options.reel,
        mode: options.mode,
        onProgress: (percent) => {
          if (percent !== lastPercent) {
            lastPercent = percent;
            renderProgress('Processing clip', percent);
          }
        },
      });

      console.log(`\n✅ Finished successfully! Saved to:\n   ${result.outputPath}\n`);
    } catch (err) {
      console.error(`\n❌ Cut failed: ${err.message}\n`);
      process.exit(1);
    }
  });

// Command: reel
program
  .command('reel')
  .description('Convert video to 9:16 vertical format (Reel/Short/TikTok)')
  .requiredOption('-i, --input <path>', 'Input video file')
  .option('-o, --output <path>', 'Output video file')
  .option('-s, --start <time>', 'Optional start time', '0')
  .option('-d, --duration <time>', 'Optional duration')
  .option('-m, --mode <mode>', 'Reel mode: "blur" (blurred background), "crop", or "pad"', 'blur')
  .action(async (options) => {
    try {
      const inputPath = path.resolve(options.input);
      const outputPath = options.output
        ? path.resolve(options.output)
        : generateOutputFilename(inputPath, { suffix: 'reel' });

      console.log(`\n📱 Converting to 9:16 vertical reel: ${path.basename(inputPath)}`);
      console.log(`🎨 Mode: ${options.mode}`);
      console.log(`🎯 Output target: ${outputPath}\n`);

      let lastPercent = -1;
      const result = await cutClip(inputPath, outputPath, {
        start: options.start,
        duration: options.duration,
        reel: true,
        mode: options.mode,
        onProgress: (percent) => {
          if (percent !== lastPercent) {
            lastPercent = percent;
            renderProgress('Rendering reel', percent);
          }
        },
      });

      console.log(`\n✅ Reel created successfully! Saved to:\n   ${result.outputPath}\n`);
    } catch (err) {
      console.error(`\n❌ Reel conversion failed: ${err.message}\n`);
      process.exit(1);
    }
  });

// Command: split
program
  .command('split')
  .description('Split a long video into sequential clips or 9:16 reels')
  .requiredOption('-i, --input <path>', 'Input video file')
  .option('-o, --output-dir <dir>', 'Output directory', './reels')
  .option('-n, --interval <seconds>', 'Interval per clip in seconds', '30')
  .option('--no-reel', 'Do not format to 9:16 vertical reels (keep original aspect ratio)')
  .option('-m, --mode <mode>', 'Reel mode: "blur", "crop", or "pad"', 'blur')
  .action(async (options) => {
    try {
      const inputPath = path.resolve(options.input);
      const outDir = path.resolve(options.outputDir);

      console.log(`\n🎞️  Splitting video: ${path.basename(inputPath)}`);
      console.log(`⏱️  Interval: ${options.interval}s per reel`);
      console.log(`📱 Format: ${options.reel ? `9:16 Vertical Reel (${options.mode})` : 'Original Aspect Ratio'}`);
      console.log(`📂 Output directory: ${outDir}\n`);

      const results = await splitIntoReels(inputPath, outDir, {
        interval: options.interval,
        reel: options.reel,
        mode: options.mode,
        onOverallProgress: ({ current, total, start, duration }) => {
          console.log(`▶️ Processing part ${current} of ${total} (Start: ${start}s, Duration: ${duration.toFixed(1)}s)...`);
        },
        onSegmentComplete: (segment) => {
          console.log(`  ✓ Part ${segment.index} done: ${path.basename(segment.outputPath)}`);
        },
      });

      console.log(`\n🎉 Successfully split into ${results.length} reels in:\n   ${outDir}\n`);
    } catch (err) {
      console.error(`\n❌ Split failed: ${err.message}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);
