const getHTML = (title: string, content: string) => {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
    <style>
        .status-badge { @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium; }
        .status-created { @apply bg-blue-100 text-blue-800; }
        .status-queued { @apply bg-yellow-100 text-yellow-800; }
        .status-delivered { @apply bg-green-100 text-green-800; }
        .status-failed { @apply bg-red-100 text-red-800; }
        
        .loader {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: rgba(255, 255, 255, 0.9);
          z-index: 9999;
          padding: 1rem;
          text-align: center;
        }
        
        .loader.active {
          display: block;
        }
        
        .spinner {
          display: inline-block;
          width: 40px;
          height: 40px;
          border: 3px solid rgba(59, 130, 246, 0.3);
          border-radius: 50%;
          border-top-color: rgb(59, 130, 246);
          animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
    </style>
    <script>
      // Show loader when navigating
      document.addEventListener('DOMContentLoaded', function() {
        const links = document.querySelectorAll('a[href^="/dashboard"]');
        const loader = document.createElement('div');
        loader.className = 'loader';
        loader.innerHTML = '<div class="spinner"></div><div class="mt-2 text-sm text-gray-600">Loading...</div>';
        document.body.appendChild(loader);
        
        links.forEach(link => {
          link.addEventListener('click', function(e) {
            if (!e.ctrlKey && !e.metaKey) {
              loader.classList.add('active');
            }
          });
        });
        
        // Hide loader when page loads
        window.addEventListener('pageshow', function() {
          loader.classList.remove('active');
        });
      });
    </script>
</head>
<body class="bg-gray-30 min-h-screen">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between mb-6">
          <a href="/dashboard">
            <div class="flex items-center gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
                </div>
            </div>
          </a>
        </div>
  
        ${content}
    </main>
</body>
</html>
    `;
};

export { getHTML };
