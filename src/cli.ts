#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { zipS3Folder, ConsoleLogger, S3ZipConfig, ProgressEvent, StorageClass } from './index';
import { formatBytes, formatDuration } from './utils/helpers';

const program = new Command();

program
  .name('s3-zip-transfer')
  .description('Compacta pastas do S3 em ZIP e gera links assinados')
  .version('1.2.0');

program
  .requiredOption('-s, --source-bucket <bucket>', 'Bucket S3 de origem')
  .requiredOption('-d, --dest-bucket <bucket>', 'Bucket S3 de destino')
  .option('-p, --prefix <prefix>', 'Prefixo/pasta no bucket de origem', '')
  .option('-k, --key <key>', 'Nome do arquivo ZIP no destino')
  .option('-r, --region <region>', 'Região AWS', 'us-east-1')
  .option('-c, --compression <level>', 'Nível de compressão (0-9)', '6')
  .option('-e, --expires <seconds>', 'Tempo de expiração da URL (segundos)', '3600')
  .option('--max-retries <number>', 'Máximo de tentativas em caso de falha', '3')
  .option('--part-size <bytes>', 'Tamanho das partes no multipart upload', String(10 * 1024 * 1024))
  
  // Novos v1.2
  .option('-i, --include <patterns...>', 'Padrões glob para incluir (ex: "*.jpg" "docs/**")')
  .option('-x, --exclude <patterns...>', 'Padrões glob para excluir (ex: "*.tmp" "node_modules/**")')
  .option('--storage-class <class>', 'Storage class do S3 (STANDARD, STANDARD_IA, GLACIER, etc)', 'STANDARD')
  .option('--checksum', 'Gerar checksum MD5 do arquivo ZIP')
  .option('--dry-run', 'Simular sem executar (mostra o que seria processado)')
  .option('--flatten', 'Achatar estrutura de pastas (todos os arquivos na raiz)')
  .option('--sse <type>', 'Server-side encryption (AES256 ou aws:kms)')
  .option('--sse-kms-key <keyId>', 'KMS Key ID para SSE')
  .option('--metadata <json>', 'Metadata customizado em JSON')
  .option('--tags <json>', 'Tags em JSON (ex: {"env":"prod"})')
  
  .option('-q, --quiet', 'Modo silencioso (apenas resultado)')
  .option('--json', 'Saída em formato JSON')
  .option('-v, --verbose', 'Modo verboso (debug)');

program.parse();

const opts = program.opts();

async function main() {
  const isQuiet = opts.quiet;
  const isJson = opts.json;
  const isVerbose = opts.verbose;
  const isDryRun = opts.dryRun;

  const logger = new ConsoleLogger({
    level: isQuiet ? 'error' : isVerbose ? 'debug' : 'info',
    colors: !isJson,
    json: isJson,
  });

  // Parse metadata e tags
  let metadata: Record<string, string> | undefined;
  let tagging: Record<string, string> | undefined;

  try {
    if (opts.metadata) {
      metadata = JSON.parse(opts.metadata);
    }
    if (opts.tags) {
      tagging = JSON.parse(opts.tags);
    }
  } catch (e) {
    console.error(chalk.red('Erro ao parsear JSON de metadata/tags'));
    process.exit(1);
  }

  const config: S3ZipConfig = {
    sourceBucket: opts.sourceBucket,
    sourcePrefix: opts.prefix,
    destinationBucket: opts.destBucket,
    destinationKey: opts.key || `backup-${Date.now()}.zip`,
    region: opts.region,
    compressionLevel: parseInt(opts.compression, 10),
    presignExpiresIn: parseInt(opts.expires, 10),
    maxConcurrency: 10,
    maxRetries: parseInt(opts.maxRetries, 10),
    partSize: parseInt(opts.partSize, 10),
    includePatterns: opts.include,
    excludePatterns: opts.exclude,
    storageClass: opts.storageClass as StorageClass,
    metadata,
    tagging,
    serverSideEncryption: opts.sse as 'AES256' | 'aws:kms' | undefined,
    sseKmsKeyId: opts.sseKmsKey,
    generateChecksum: opts.checksum || false,
    dryRun: isDryRun || false,
    preserveDirectoryStructure: !opts.flatten,
    flattenPaths: opts.flatten || false,
  };

  if (!isJson && !isQuiet) {
    console.log(chalk.cyan.bold('\n🚀 S3 Zip Transfer v1.2\n'));
    console.log(chalk.gray(`   Origem:  s3://${config.sourceBucket}/${config.sourcePrefix}`));
    console.log(chalk.gray(`   Destino: s3://${config.destinationBucket}/${config.destinationKey}`));
    
    if (isDryRun) {
      console.log(chalk.yellow('\n   ⚠️  MODO DRY-RUN - Nenhuma alteração será feita\n'));
    }
    
    if (config.includePatterns?.length) {
      console.log(chalk.gray(`   Include: ${config.includePatterns.join(', ')}`));
    }
    if (config.excludePatterns?.length) {
      console.log(chalk.gray(`   Exclude: ${config.excludePatterns.join(', ')}`));
    }
    console.log('');
  }

  let lastPhase: string = '';
  let spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIdx = 0;

  const onProgress = (event: ProgressEvent) => {
    if (isQuiet || isJson) return;

    const phaseEmoji: Record<string, string> = {
      listing: '📂',
      filtering: '🔍',
      compressing: '📦',
      uploading: '☁️ ',
      finalizing: '✨',
      done: '✅',
    };

    const emoji = phaseEmoji[event.phase] || '⏳';

    if (event.phase !== lastPhase) {
      if (lastPhase) console.log('');
      lastPhase = event.phase;
    }

    spinnerIdx = (spinnerIdx + 1) % spinnerChars.length;
    const spinner = chalk.cyan(spinnerChars[spinnerIdx]);

    if (event.phase === 'listing') {
      process.stdout.write(`\r${spinner} ${emoji} Listando... ${event.processed} objetos encontrados`);
    } else if (event.phase === 'filtering') {
      process.stdout.write(`\r${spinner} ${emoji} Filtrando arquivos...`);
    } else if (event.phase === 'compressing') {
      const bar = createProgressBar(event.percentage, 30);
      const speed = event.speed ? ` (${formatBytes(event.speed)}/s)` : '';
      const eta = event.eta ? ` ETA: ${formatDuration(event.eta)}` : '';
      process.stdout.write(
        `\r${emoji} Comprimindo: ${bar} ${event.percentage}% (${event.processed}/${event.total})${speed}${eta}   `
      );
    } else if (event.phase === 'uploading') {
      const bar = createProgressBar(event.percentage, 30);
      const speed = event.speed ? ` (${formatBytes(event.speed)}/s)` : '';
      process.stdout.write(`\r${emoji} Upload: ${bar} ${event.percentage}%${speed}   `);
    } else if (event.phase === 'finalizing') {
      process.stdout.write(`\r${spinner} ${emoji} Finalizando...`);
    } else if (event.phase === 'done') {
      console.log(`\n${emoji} Concluído!`);
    }
  };

  try {
    const result = await zipS3Folder({
      config,
      logger,
      onProgress,
    });

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!isQuiet) {
      console.log('');
      console.log(chalk.green.bold('\n📊 Resultado:\n'));
      console.log(chalk.white(`   Arquivos:      ${result.objectCount}`));
      console.log(chalk.white(`   Original:      ${formatBytes(result.totalSourceSize)}`));
      
      if (!isDryRun) {
        console.log(chalk.white(`   Comprimido:    ${formatBytes(result.size)}`));
        console.log(chalk.white(`   Compressão:    ${result.compressionRatio?.toFixed(2)}x`));
      }
      
      console.log(chalk.white(`   Duração:       ${formatDuration(result.durationMs)}`));
      console.log(chalk.white(`   Velocidade:    ${formatBytes(result.metrics.bytesPerSecond)}/s`));
      
      if (result.checksum) {
        console.log(chalk.white(`   MD5:           ${result.checksum}`));
      }
      
      if (result.errors.length > 0) {
        console.log(chalk.yellow(`\n   ⚠️  ${result.errors.length} arquivo(s) com erro`));
        if (isVerbose) {
          result.errors.forEach(e => console.log(chalk.gray(`      - ${e}`)));
        }
      }

      if (result.skipped.length > 0) {
        console.log(chalk.gray(`\n   ⏭️  ${result.skipped.length} arquivo(s) ignorados por filtros`));
      }

      if (!isDryRun && result.presignedUrl) {
        console.log(chalk.cyan.bold('\n📥 Link para download:\n'));
        console.log(chalk.underline(result.presignedUrl));
        console.log(chalk.gray(`\n   Expira em: ${result.expiresAt.toLocaleString()}\n`));
      }
    } else {
      // Modo quiet: apenas a URL
      if (!isDryRun) {
        console.log(result.presignedUrl);
      }
    }

    process.exit(0);
  } catch (error) {
    if (isJson) {
      console.log(JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : String(error),
        code: (error as any).code,
      }));
    } else {
      console.error(chalk.red(`\n❌ Erro: ${error instanceof Error ? error.message : error}\n`));
    }
    process.exit(1);
  }
}

function createProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

main();
