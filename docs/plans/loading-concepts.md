# Loading concepts

Currently when the user first tries to access views such as /library /Focus /index /subjects the time it takes to load the concepts is significant, even good internet connection in local environment sometimes it takes up 3 seconds to load some of these views.

I do not know how we are handling loading these concepts, but we need a simple solution that makes the experience much more "instantaneous", once the user has navigated to these views and the concepts have been loaded then navigation becomes "instantaneous" it seems that we are probably caching these concepts somehow. That's the kind of experience we want the user to have all the time if possible.

I do not know what can be done since I have not studied the code/architecture in depth yet. The only idea I have is that when the user first logs in to the app we could probably be already be fetching all the concepts, or preloading all these views. I am not sure how costly that is..

This might be a simple fix for when the user has relative a few concepts. But when it goes up into the thousands and tens of thousands it might not be so easy.

On the other hand, so far we are only storing text data, so even at say 10,000 or 20,000 concepts it should not be a ton of data space... but you could do calculations... whatever solution we come up with we should consider scalability, or in other words, it should work for a few concepts or for tens of thousands of concepts (ive been testing the prod app for about a month and i have 300+ concepts with notes, you can see how after 10 years of heavy use I might have tens of thousands potentially)...

I really prefer if we could just load everything to other solutions like pagination or partial loading... but I have no idea what can or cannot be done.. Please provide a simple solution plan that is scalable, or if there is not one best solution maybe a set of potential solution ideas (whether partial or full loading, etc)

Also somewhat related to this issue is that when the user first clicks on these views and we start fetching, for a moment the user sees the default message that he has no concepts yet (but this is not always true, he may already have concepts but they are being fetched)
