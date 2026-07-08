click new project

![icreate-project-screene](https://cdn.hackclub.com/019f3a4b-4642-7ab7-bb12-3a0439a54da8/paste-1783389438456.png)

create project, create description. here I said 

Turn the knob to set how bright the LED glows, and press the button to switch it on or off. When you turn it back on, it remembers your brightness setting.

share your whole screen because insert here

I click +add on the right top coirner to add breadboard for connection

I connect power rails like so 

![image](https://cdn.hackclub.com/019f403e-605a-7cb2-8d8b-d4e87ef56662/paste-1783489256202.png)

you dont need to do it exactly like this. I did thisbecause it is typical for 1 rail to be 3v3 and gnd, andthe other 5v and gnd (more detail as to why here) I tried to make the wires readable

I add a LED directly on the 5v rail. it blows up as attached because it burn out 



 ![image](https://cdn.hackclub.com/019f4048-3f8d-720f-8235-67691fab4add/paste-1783489903022.png)

so I add the 220 resister like so because add here

![image](https://cdn.hackclub.com/019f405d-f455-7b96-a403-8ec4069f66a8/paste-1783491325530.png)

but we want this to be not on all the time! I dont really want the LED to be at ful brightness 24/7,my eye hurt :( Since I want this to be variable, im going to connect this to a GPIO. 

I connected this to pin number 3. because For brightness control you need PWM pins (they use analogWrite()). Which ones depends on your board; for this one, the ones w
 a potentiometer to control its brghtness, I googled 

potentiometer 3 pin datasheet breakout


^^^ break down this google search to kinda teach how to google


