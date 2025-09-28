{% set site_name = watch_url %}
{% set raw_headline = restock.price%}
{% set headline = raw_headline
     | replace("\r\n","\n")
     | replace("\n","\\n")
     | truncate(3800, True, "…")
%}

{
  "username": "Scotty Cameron Stock",
  "embeds": [
    {
      "title": "{{ site_name }}",
      "url": "{{ watch_url }}",
      "color": 4372701,
      "description": "Previous Price {{ restock.original_price}} Current Price: {{restock.price}}",
      "fields": [
        {
          "name": "Source",
          "value": "{{ watch_url }}",
          "inline": true
        }
      ],
      "footer": {
        "text": "Watch {{ watch_uuid }}"
      }
    }
  ]
}
