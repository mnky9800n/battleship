
# BATTLESHIP

*The spike is a Sentience-grounded LLM opponent that reads your recent memories and uses them to taunt you in game. Live at johnspace.xyz/battleship.*

## How I approached it

I approached this activity with the following thoughts on the top of my head:

1. The entire game interface I already implemented in rainy-city.com including the graphics for the map and the interaction with the map like clicking and dragging things, locating the cursor on the map, and zooming, therefore I could hand all this to Claude as a solved problem and sort of skip over this step
2. I wanted my spike to somehow be connected to Sentience itself. Originally I wanted to see if I could hack the API in some way to get Sentience to make the decisions for game play but this quickly became a different solution using Sentience memories as a reference point for taunting the player
3. I wanted to capture a 90s hacker aesthetic
4. I wanted to make sure I got playtesters in the game before shipping so I recruited my friend Lena (product designer, former Amazon) and Nick (CEO of Recurse) to play some games
5. I wanted to use my pre-existing DigitalOcean server (I call it homebase) that serves some other things such as the zulip-zork bot that allows recursers to play zork via zulip
6. I knew better than to dive into Claude and coding immediately, that is always a trap, so I wrote a lengthy design document that I shared with a friend (Lena) who made a few suggestions on UX design. I then shared with Claude (pc app, not Claude Code) and discussed at length the particular decision making workflows the app will need to go through, and also technologies that I didn't have experience in (websockets)

Taking all this into account I knew it would take a couple days of work, not because it couldn't be doable in a day, I just know that decision making on some topics is easier when you let it rest a day. So Day 1, I made a design document and started writing a dev blog. Dev blog writing I find is always good in the beginning and sort of trails off into PR and commit messages later in the dev cycle. This is okay for me, I would rather let a good decision take a bit extra time than a bad decision be made hastily.

## Day 2: building the game

On Day 2, I implemented the core of the battleship game. I used planning mode in Claude Code for this and we decided to implement the front end first since it would be easiest since most of the code just needed to be refactored from rainy-city.com. This also made it easy to make a playtestable game (just with no save state) since you could already implement the entire game client side with a fake server backend that also ran client side (only for this step in the dev process).

After implementing the front end I implemented the back end. Claude does most of the heavy lifting of course. Originally I had some idea to use Flask. I am very glad I didn't use Flask because I don't think that Flask would have solved this problem and probably would have introduced a lot of issues. Instead we used FastAPI with python-socketio running on uvicorn, an async ASGI stack. This mattered more than I expected. Flask is synchronous WSGI, and this game is basically an always-on websocket server holding many concurrent games, where the AI's turn goes off to call an LLM. In Flask that blocking call would stall the event loop; in the async stack the bot can think without freezing everyone else's game. SQLite handles the persistence: completed games with their move logs and timestamps, which is plenty for a single-box deploy and trivially queryable later. And I didn't want "queryable later" to just be a hand-wave, so I exposed it as a small read API (`GET /games` for the history, `GET /games/{id}` for a single game's full move log): the completed history is literally an HTTP call away, replay included.

One thing that is nice about having a design document is Claude has both a guide and I have a static idea of what the game should be and so we can go back and forth on this, since Claude is happy to drift from a design doc and without a design doc I think devs are happy to start accepting something slightly different than the original design. Eventually all these slight differences end up with quite a different product than the original idea. This is also true for what clients need. I asked Claude to go through the original design document and also the Sentience task assignment and we discovered we never implemented the requested "rematch" button.

Another thing I enjoy about developing with Claude is that it provides you with a varying level of abstraction as you need it. I don't really need to pay attention to porting the rainy-city.com code as much as I did for the backend stuff simply because I can see it with my eyes and I already developed that code so I know the core of it will work. I think this is one of the reasons why you can develop faster with Claude. You need to pay attention but it's more like pair programming in a sense than it is AGI.

## Anti-cheat and scale

The whole backend is shaped around one rule: the server is the only authority and ship positions never leave it. The client is a thin renderer. Every shot comes back redacted, just hit/miss/sunk plus whichever of the opponent's cells are already revealed, so there is nothing in the browser to inspect or tamper with. Identity is bound to the websocket when it connects, not read from the message, so you can't spoof someone else's move or ask for their board by lying in a payload. On scale: a shot is an O(1) coordinate lookup and each game is a small in-memory state plus an append-only move log, so a 10x10 or a 1000x1000 board is the same dictionary lookup. The only thing that grows with board size is BayesBot's placement enumeration, and that's the AI's problem, not the game's.

## Persistence and deployment

Battleship state also has to survive a page refresh mid-game, which is a requirement I underestimated. The server keeps each game in memory with an append-only move log, and a reconnecting client gets its redacted view replayed, so a browser refresh drops you right back into the game where you left off. This actually broke in production: taunts would occasionally double up. We traced it to Socket.IO not guaranteeing exactly-once delivery (a transient reconnect can redeliver an event) and fixed it by stamping each message with an id and deduping on the client. I like that the bug forced me to handle real production behavior and not just the happy path. Deployment is homebase (my DigitalOcean box) reached over Tailscale, with Caddy terminating TLS and reverse-proxying to the uvicorn service; the frontend is served from GitHub Pages off the main branch.

## Working with GitHub

Even though I was the only human on this, I never committed to main. Every feature went on its own branch and through a pull request that Claude Code opened and I reviewed and merged. That sounds like ceremony for a solo project, but it's the thing that makes the work legible: the Sentience reviewers can read the history as a sequence of scoped, described changes instead of one giant blob. It also kept Claude honest, since a PR is a natural checkpoint to actually read the diff. A couple of times that caught real things, like the duplicate-taunt bug above that a review pass surfaced. Deploy is just a pull of main onto homebase and a service restart.

## Day 3: chat and BayesBot

On Day 3 I spent a lot of time implementing chat so that I could work on the spike, putting LLM chat and taunting in game. Chat helps the player integrate into the game, without it, basically the player doesn't really know if the other player is even there or not. Chat is only persistent to a game, there is no global chat (I think another obvious feature is a matchmaking chat room for all players). For fun I also added a Bayesian update model that uses available information to inform the next location for firing. This is essentially a very simple solution of a Partially Observed Markov Decision Process (POMDP), but also, it is, at least to me, the obvious solution to battleship. Playing against this bot (BayesBot) it is usually better than any of the other implemented bots. It doesn't chat and taunt you though. But, if you ever played Magic the Gathering and know about Spike and Timmy players, this is definitely the Spike player. It plays to win. haha. But the Spike that I built plugs into Sentience itself.

# Spike: Sentience as a player

I had this idea that we could build a Sentience enabled AI that would play the game through the API. However, the API only allows for reading and writing memories. So instead I thought we could use the recent memories to taunt the player through the chat function. This actually gave me the idea that Sentience integration into any game could be cool if there are LLM enabled NPCs because you could play yourself in a video game and those NPCs could have a context about you. This would be rather different from most games where you play someone else. Like second life, except instead of having the ability to fly, the game understands your context.

Anyways, So I implemented an anthropic Haiku model LLM that, if you pick HaikuBot it will not know your context, but if you pick SentienceBot and provide your API key (its https and is not stored after but rotate your key if you do this just to be safe lol) it will use your context to send messages that taunt you. It doesn't dig too deeply, I think it would require some testing and guard rails to ever be actually implemented, but its kind of shocking to have the bot tell you things like "you were never good at geoscience and you arent good at battleship either" or other personal digs.
