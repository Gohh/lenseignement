import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { AddResourceSchema } from '@lenseignement/types';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { UsersService } from '../users/users.service.js';
import {
  addLibraryFile,
  addResource,
  myResources,
  readLibraryFile,
  removeResource,
} from './library.js';

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TeamError) {
      if (error.kind === 'not_found') throw new NotFoundException(error.message);
      if (error.kind === 'forbidden') throw new ForbiddenException(error.message);
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Demande invalide.');
  }
  return result.data;
}

/** Envoie un fichier ; une erreur de lecture coupe la réponse sans arrêter le serveur. */
function send(stream: ReadStream, response: Response): void {
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

/** Bibliothèque : livres et liens partagés avec une classe. */
@Controller()
export class LibraryController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  private async me(request: Request): Promise<string> {
    return (await this.users.resolve(request.principal as Principal)).id;
  }

  @Get('me/resources')
  async mine(@Req() request: Request) {
    return { items: await myResources(this.db, await this.me(request)) };
  }

  @Post('cohorts/:id/resources')
  async add(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(AddResourceSchema, body);
    return guard(async () =>
      addResource(this.db, await this.me(request), id, input, request.traceId),
    );
  }

  /**
   * Fichier d'un livre (contenu ou couverture) : les octets bruts en flux (application/octet-stream),
   * le vrai type dans l'en-tête x-file-type et le nom d'origine dans x-file-name.
   */
  @Post('resources/:id/files')
  async upload(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('role') role: string | undefined,
  ) {
    const user = await this.me(request);
    const mime = String(request.headers['x-file-type'] ?? '');
    let name: string | null = null;
    try {
      name = request.headers['x-file-name']
        ? decodeURIComponent(String(request.headers['x-file-name']))
        : null;
    } catch {
      name = null;
    }
    return guard(() => addLibraryFile(this.db, user, id, role ?? 'content', mime, name, request));
  }

  /** Lecture d'un fichier de livre, morceau par morceau si demandé (audio, vidéo). */
  @Get('library-files/:id')
  async download(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await guard(async () => readLibraryFile(this.db, await this.me(request), id));
    const headers: Record<string, string> = {
      'content-type': file.mime,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-disposition': 'inline',
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range ?? ''));
    if (range && (range[1] || range[2])) {
      const size = file.sizeBytes;
      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (start > end || start >= size) {
        response
          .status(416)
          .set({ 'content-range': `bytes */${size}` })
          .end();
        return;
      }
      response.status(206).set({
        ...headers,
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': String(end - start + 1),
      });
      send(createReadStream(file.path, { start, end }), response);
      return;
    }
    response.status(200).set({ ...headers, 'content-length': String(file.sizeBytes) });
    send(createReadStream(file.path), response);
  }

  @Delete('resources/:id')
  @HttpCode(200)
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    await guard(async () => removeResource(this.db, await this.me(request), id, request.traceId));
    return { ok: true };
  }
}
