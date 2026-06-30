
# day 1 - part 1

It is quite tempting to take the notion document and dump it on claude and then simply let claude do everything. Now of course, I will eventually do this however I think that first it is better to spend some time architecting what is I think a battleship app might need. Of course, my main background is in data science and machine learning so making an app like this embraces the Recurse culture of "working at the edge of my abilities." So I will dive in.

What are the things that are necessary to run an app like this at the most basic level?

1. a computer exposed to the internet or some kind of services, etc. like heroku that will run the app for me, since I already have my digital ocean server "homebase" I think I will start there as the host
2. a backend and a front end, the front end claude can develop easily, the backend as well
3. some kind of login service that connects the two, since we don't realyl crae about security and we aren't asked, an initial stage can just be "username":"password"
4. backend needs something that stores data such as game state, whose turn it is, etc. and then can generate on the fly updates (maybe something like flask), it also needs some kind of matchmaking service so that if two players are logged in the system knows they are there and can find each other
5. front end needs the login screen, gameboard for the player, a matchmaking page so people can find logged in users, maybe some fun animations eventually (can pull the destruction animations from rainy-city.com, actually, why not pull the whole map making from rainy-city.com? it will create an isometric view but i can probably find 3d ship assets and also the whales in rainy-city.com can live on in battleship. that will be fun.
6. probably need some kind of tester person to help me out so i can play the game and test it and make sure it is working right before i send off to sentience, you know since there is only going to be sentience players probably can make some sort of sentience API integration where your sentience can play the AI side of the game against you, ahaha okay this scope creep maybe this can be the spike. yesssss, sentience game market place, okay nayways.
7. could also have some sort of rudimentary chat app so players can chat back and forth, in the meantime lets keep the scope creep going, and not forget our rainy-city.com lesson of the MVP https://www.lowimpactfruit.com/p/rainy-citycom-a-side-project-i-have
8. at teh end of the devblog writing prior to delivery there should be an AI summary of the dev blog

thoughts: given that the only way to connect is over the api that means we have to have some sort of encrypted blah blah to get players to pass API keys over the internet to the app, maybe its asking too much for a two day task.

more thoughts from sentience: Anti-cheat: the key is never send ship positions to the opponent's client. Keep that server-side only, return only hit/miss results. For scaling, the grid is just coordinate lookups so it's O(1) per shot regardless of board size.

more thoughts from me: i do think the spike is to have some sort of AI playing the game and maybe like taunting you through the chat? i dont know that seems expensive but maybe its worth it. i would like to do sentience integration since it would just be so much fun, lets see what claude comes up with in planning mode.

notes: i have selected and added boat assets, these should look good on the map, assuming they are adequately sized next to the whales.

# day 1 - part 2

I made a design doc called battleship_design_doc.pdf. it serves as the core design doc for the whole game and can be used by claude code to build everything. I gave this design doc to claude who gave some helpful additional diagrams to add that included some loops i didn't think about that would make the timeouts for disconnects more explicit in teh design doc. timeouts can come from two reasons, out of game during a challenge to another player the other player doesn't reply you within the given grace period (currently 60 seconds), or, during gameplay, the player logs out or disconnects for whatever reason for longer than the grace period.

added ship assets. now there are 3d models of ships to use.
