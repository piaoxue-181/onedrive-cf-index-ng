import axios from 'redaxios'
import { NextResponse, NextRequest } from 'next/server'

import { getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'

export const runtime = 'edge'

/**
 * Sanitize the search query
 *
 * @param query User search query, which may contain special characters
 * @returns Sanitised query string, which:
 * - encodes the '<' and '>' characters,
 * - replaces '?' and '/' characters with ' ',
 * - replaces ''' with ''''
 * Reference: https://stackoverflow.com/questions/41491222/single-quote-escaping-in-microsoft-graph.
 */
function sanitiseQuery(query: string): string {
  const sanitisedQuery = query
    .replace(/'/g, "''")
    .replace('<', ' &lt; ')
    .replace('>', ' &gt; ')
    .replace('?', ' ')
    .replace('/', ' ')
  return encodeURIComponent(sanitisedQuery)
}

export default async function handler(req: NextRequest): Promise<Response> {
  // Query parameter from request
  const { q: searchQuery = '' } = Object.fromEntries(req.nextUrl.searchParams)

  // 空查询直接返回空数组，避免无谓的 Graph API 调用
  if (typeof searchQuery !== 'string' || searchQuery.length === 0) {
    return NextResponse.json([])
  }

  try {
    // Get access token from storage
    const accessToken = await getAccessToken()

    // 在根目录下搜索。
    // 注意：Graph API 的正确格式是 /root/search(q='...')，
    // 根路径不需要 encodePath('/') 和多出来的 ':'。
    const searchApi = `${apiConfig.driveApi}/root/search(q='${sanitiseQuery(searchQuery)}')`

    const { data } = await axios.get(searchApi, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,name,file,folder,parentReference',
        top: siteConfig.maxItems ?? 100,
      },
    })

    return NextResponse.json(data.value ?? [], {
      headers: {
        'Cache-Control': apiConfig.cacheControlHeader,
      },
    })
  } catch (error: any) {
    // 打印完整错误到 Worker 日志（Cloudflare Dashboard → 你的 Pages 项目 → Functions 日志）
    console.error('Search API error:', {
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data,
      stack: error?.stack,
    })

    return new Response(
      JSON.stringify({
        error: error?.response?.data ?? error?.message ?? 'Internal server error.',
      }),
      {
        status: error?.response?.status ?? 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
