document.getElementById("submitBtn").onclick = async function() {
  const payload = { prompt: document.getElementById("input").value, depth: 5 };
  try {
    const res = await fetch('http://localhost:3000/generate-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Read text first so we can log raw responses on parse failure
    const text = await res.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (parseErr) {
      console.error('Failed to parse JSON response from server:', text);
      throw parseErr;
    }

    if (result?.error) {
      console.error('API Error:', result);
      return;
    }
    result.forEach(t => {
      let div = document.createElement('div');
      div.innerText = t;
      document.getElementById("tasksContainer").appendChild(div);
    });

  } catch (err) {
    console.error('Request failed:', err);
  }
}