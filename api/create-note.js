// api/create-note.js
// Final version: A streaming proxy for Dify workflows with mobile compatibility.

export default async function handler(req, res) {
  // We only support POST method for this endpoint.
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // 接收结构化的数据
    const { emotion, event, behavior, userName } = req.body;
    
    // 验证输入
    if (!emotion || !event || !behavior) {
      return res.status(400).json({ error: 'Bad Request: emotion, event, and behavior are required.' });
    }

    const DIFY_API_KEY = process.env.DIFY_API_KEY;
    const DIFY_API_URL = 'https://api.dify.ai/v1/workflows/run';

    if (!DIFY_API_KEY) {
      console.error('DIFY_API_KEY is not set.');
      return res.status(500).json({ error: 'Server configuration error: API key is missing.' });
    }

    // 关键修复：构建 Dify 工作流期望的输入格式
    const difyInputs = {
      "user_emotion_input": emotion,
      "user_event_description": event,
      "user_behavior_input": behavior
    };

    console.log('Dify Inputs:', difyInputs);

    // 智能客户端检测：判断是否为微信小程序
    const userAgent = req.headers['user-agent'] || '';
    const isWeChatMiniProgram = userAgent.includes('miniProgram') || 
                                userAgent.includes('MicroMessenger');

    // 构建Dify API请求体
    const requestBody = {
      inputs: difyInputs, // 使用修正后的输入
      response_mode: isWeChatMiniProgram ? 'blocking' : 'streaming',  // 智能模式切换
      user: userName || 'quantum-user-' + Date.now()
    };

    console.log('Request mode:', requestBody.response_mode, '(Client:', isWeChatMiniProgram ? 'WeChat' : 'Other', ')');

    // 调用Dify工作流
    const response = await fetch(DIFY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('Dify API error:', response.status, response.statusText);
      return res.status(response.status).json({ 
        error: `Dify API error: ${response.status} ${response.statusText}` 
      });
    }

    if (requestBody.response_mode === 'blocking') {
      // Blocking mode: 直接返回完整结果（适用于微信小程序）
      const result = await response.json();
      console.log('Blocking response received');
      
      if (result.data && result.data.outputs) {
        return res.status(200).json({
          success: true,
          data: result.data.outputs
        });
      } else {
        console.error('Unexpected response format:', result);
        return res.status(500).json({ error: 'Unexpected response format from Dify API.' });
      }
    } else {
      // Streaming mode: 流式传输（适用于其他客户端）
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        res.end();
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.write('\n\nStreaming error occurred.');
        res.end();
      }
    }
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
} 