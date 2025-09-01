@@ .. @@
 router.get('/videos', authMiddleware, async (req, res) => {
   try {
     const userId = req.user.id;
     const userLogin = req.user.email ? req.user.email.split('@')[0] : `user_${userId}`;
     const folderId = req.query.folder_id;

+    console.log(`📊 Carregando vídeos para conversão - Usuário: ${userId}, Pasta: ${folderId}`);

     let whereClause = 'WHERE v.codigo_cliente = ?';
     let params = [userId];

     if (folderId) {
       whereClause += ' AND v.pasta = ?';
       params.push(folderId);
     }
     
     // Adicionar suporte para usuários de streaming
     whereClause = `WHERE (v.codigo_cliente = ? OR v.codigo_cliente IN (
       SELECT codigo_cliente FROM streamings WHERE codigo = ?
     ))`;
     params = [userId, userId];
     
     if (folderId) {
       whereClause += ' AND v.pasta = ?';
       params.push(folderId);
     }

+    console.log(`🔍 Query: ${whereClause}, Params: ${JSON.stringify(params)}`);

     // Buscar vídeos do banco com informações de conversão
     const [rows] = await db.execute(
       `SELECT 
         v.id,
         v.nome,
         v.url,
         v.caminho,
         v.duracao,
         v.tamanho_arquivo as tamanho,
         v.bitrate_video,
         v.formato_original,
         v.codec_video,
         v.largura,
         v.altura,
         v.is_mp4,
         v.compativel,
         v.pasta,
         u.bitrate as user_bitrate_limit,
         f.nome_sanitizado as folder_name,
         f.servidor_id
        FROM videos v
        LEFT JOIN folders f ON v.pasta = f.id
        LEFT JOIN streamings u ON v.codigo_cliente = u.codigo_cliente
        ${whereClause}
        ORDER BY v.id DESC`,
       params
     );

+    console.log(`📋 Encontrados ${rows.length} vídeos no banco`);
+
+    if (rows.length === 0 && folderId) {
+      console.log(`⚠️ Nenhum vídeo encontrado para pasta ${folderId}, tentando sincronizar...`);
+      
+      // Tentar sincronizar se não há vídeos
+      try {
+        const VideoSSHManager = require('../config/VideoSSHManager');
+        const videosFromServer = await VideoSSHManager.listVideosFromServer(1, userLogin, null);
+        console.log(`🔄 Sincronização encontrou ${videosFromServer.length} vídeos no servidor`);
+        
+        if (videosFromServer.length > 0) {
+          // Buscar novamente após sincronização
+          const [newRows] = await db.execute(
+            `SELECT 
+              v.id, v.nome, v.url, v.caminho, v.duracao, v.tamanho_arquivo as tamanho,
+              v.bitrate_video, v.formato_original, v.codec_video, v.largura, v.altura,
+              v.is_mp4, v.compativel, v.pasta, u.bitrate as user_bitrate_limit,
+              f.nome_sanitizado as folder_name, f.servidor_id
+             FROM videos v
+             LEFT JOIN folders f ON v.pasta = f.id
+             LEFT JOIN streamings u ON v.codigo_cliente = u.codigo_cliente
+             ${whereClause}
+             ORDER BY v.id DESC`,
+            params
+          );
+          
+          console.log(`📊 Após sincronização: ${newRows.length} vídeos encontrados`);
+          rows.splice(0, rows.length, ...newRows);
+        }
+      } catch (syncError) {
+        console.warn('Erro na sincronização:', syncError);
+      }
+    }

     // Verificar se vídeos existem no servidor e atualizar informações
     const VideoSSHManager = require('../config/VideoSSHManager');