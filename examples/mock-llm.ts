import type { Plugin } from 'vite'

// Dev-only stand-in for a host's LLM proxy, used by examples/embed-host.html.
// Speaks just enough of the OpenAI Responses API: one create_widget call, then a reply.
export function mockLlmProxy(): Plugin {
  return {
    name: 'genui-studio-mock-llm',
    configureServer(server) {
      server.middlewares.use('/__mock-llm/v1/responses', (req, res) => {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json')

          // Mimic Laravel's CSRF check so the harness can exercise auth errors.
          if (req.headers['x-csrf-token'] !== 'test-token') {
            res.statusCode = 419
            res.end(JSON.stringify({ message: 'CSRF token mismatch.' }))
            return
          }

          const request = JSON.parse(body || '{}')
          const hasToolOutput = (request.input ?? []).some((item: { type?: string }) => item.type === 'function_call_output')
          const output = hasToolOutput
            ? [{
                type: 'message',
                id: 'msg_mock',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text: 'Created a mock widget.', annotations: [] }],
              }]
            : [{
                type: 'function_call',
                id: 'fc_mock',
                call_id: 'call_mock',
                name: 'create_widget',
                status: 'completed',
                arguments: JSON.stringify({
                  name: 'Mock widget',
                  templateSource: '<Card size="sm">\n  <Title value={title} />\n</Card>',
                  schema: JSON.stringify({ type: 'object', properties: { title: { type: 'string' } } }),
                  previewData: JSON.stringify({ title: `Made by ${request.model}` }),
                }),
              }]

          res.end(JSON.stringify({
            id: `resp_mock_${Date.now()}`,
            object: 'response',
            created_at: Math.floor(Date.now() / 1000),
            status: 'completed',
            model: request.model,
            output,
          }))
        })
      })
    },
  }
}
